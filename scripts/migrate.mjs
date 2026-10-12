// Wrangler owns the local migration ledger; Sites owns hosted migration tracking.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { d1, lit, localD1Config, projectRoot } from "./local-dev.mjs";

export function migrationNames(directory) {
  const journal = JSON.parse(readFileSync(path.join(directory, "meta/_journal.json"), "utf8"));
  const names = journal.entries.map((entry) => `${entry.tag}.sql`);
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  if (new Set(names).size !== names.length || JSON.stringify(names) !== JSON.stringify(files)) {
    throw new Error("Migration SQL files must match the ordered Drizzle journal.");
  }
  return names;
}

export function baselineSql(names, through) {
  const boundary = names.indexOf(through);
  if (boundary < 0) throw new Error("Baseline requires an exact checked-in migration filename.");
  return `CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
  INSERT OR IGNORE INTO d1_migrations (name) VALUES ${names.slice(0, boundary + 1).map((name) => `(${lit(name)})`).join(", ")};`;
}

export function migrationArgs(action, configPath) {
  if (!["apply", "list"].includes(action)) throw new Error("Unsupported migration action.");
  return ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
    "d1", "migrations", action, "DB", "--local", "--config", configPath, "--persist-to", ".wrangler/state"];
}

function main(args) {
  const [action, through] = args;
  if (!(["apply", "list"].includes(action) && args.length === 1) && !(action === "baseline" && args.length === 2)) {
    throw new Error("Usage: npm run db:migrate | npm run db:status | npm run db:baseline -- <filename.sql>. Local D1 only.");
  }
  const names = migrationNames(path.join(projectRoot, "drizzle"));
  if (action === "baseline") {
    const sql = baselineSql(names, through);
    d1(sql);
    console.log(`Recorded local migrations through ${through}; migration SQL was not executed. Baseline timestamps are adoption times.`);
    return;
  }
  if (action === "apply") {
    const tables = d1("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('accounts', 'library_items', 'd1_migrations')");
    const hasAppTables = tables.some((table) => table.name !== "d1_migrations");
    const hasHistory = tables.some((table) => table.name === "d1_migrations") && d1("SELECT name FROM d1_migrations LIMIT 1").length > 0;
    if (hasAppTables && !hasHistory) throw new Error("Existing local schema has no tracked history. Confirm its last applied migration, then run db:baseline with that filename before db:migrate.");
  }
  const result = spawnSync(process.execPath, migrationArgs(action, localD1Config()), { cwd: projectRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
