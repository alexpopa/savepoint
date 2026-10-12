// Local development helpers for agents and people: SQL against local D1 and sign-in sessions.
// Everything here targets the local Wrangler state only; there is no remote mode.
// CLI: npm run d1 -- "SELECT display_name FROM accounts"
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const baseUrl = (process.env.RGBONER_URL || "http://localhost:5173").replace(/\/$/, "");
export const cookieName = "rgboner_session";

// The same placeholder database ID as vite.config.ts, so this reaches the dev server's database.
const stateDir = path.join(projectRoot, ".wrangler");
const configPath = path.join(stateDir, "agent-d1.json");

export function localD1Config() {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    name: "rgboner-local-d1",
    d1_databases: [{ binding: "DB", database_name: "site-creator-d1", database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: path.join(projectRoot, "drizzle") }],
  }));
  return configPath;
}

function wrangler(args) {
  const configPath = localD1Config();
  const result = spawnSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
    "d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", ".wrangler/state", "--json", ...args], { cwd: projectRoot, encoding: "utf8" });
  const output = result.stdout.slice(result.stdout.indexOf("["));
  if (result.status !== 0) throw new Error(`Local D1 failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(output);
}

// Quote a value as an SQL literal. Use it for every value placed into d1() SQL.
export function lit(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

// Run one or more statements; returns the rows of the last statement.
export function d1(sql) {
  const results = wrangler(["--command", sql]);
  return results.at(-1)?.results ?? [];
}

export function findAccount(displayName) {
  const [account] = d1(`SELECT user_id AS userId, email, display_name AS displayName, is_public AS isPublic FROM accounts
    WHERE lower(display_name) = lower(${lit(displayName)}) AND password_hash IS NOT NULL AND email_verified_at IS NOT NULL`);
  return account ?? null;
}

// Create a one-day session for any verified local account, matching app/auth.ts (64 hex token, SHA-256 hash).
export function mintSession(displayName) {
  const account = findAccount(displayName);
  if (!account) throw new Error(`No verified local account named ${displayName}. Run: npm run test-account`);
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  d1(`DELETE FROM sessions WHERE user_id = ${lit(account.userId)} AND expires_at < ${Date.now()};
    INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${lit(hash)}, ${lit(account.userId)}, ${Date.now() + 24 * 60 * 60 * 1000})`);
  return { ...account, token, cookie: `${cookieName}=${token}` };
}

// Same-origin fetch against the dev server as a signed-in player.
export async function appFetch(session, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: { "content-type": "application/json", origin: baseUrl, ...(session ? { cookie: session.cookie } : {}), ...init.headers },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, ok: response.ok, body };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sql = process.argv.slice(2).join(" ");
  if (!sql) { console.error('Usage: npm run d1 -- "SELECT ..."'); process.exit(1); }
  console.log(JSON.stringify(d1(sql), null, 2));
}
