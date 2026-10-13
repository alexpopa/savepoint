import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { baselineSql, migrationArgs, migrationNames } from "../scripts/migrate.mjs";

test("migration files match the complete ordered Drizzle journal", () => {
  const names = migrationNames(new URL("../drizzle/", import.meta.url).pathname);
  assert.equal(names[0], "0000_marvelous_wolverine.sql");
  assert.equal(names.at(-1), "0024_striped_mad_thinker.sql");
  const db = new DatabaseSync(":memory:");
  for (const name of names) db.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'xbox_unlocks'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'psn_unlocks'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ra_unlocks'").get());
  assert.ok(db.prepare("SELECT name FROM pragma_table_info('steam_connections') WHERE name = 'sync_paused'").get());
  assert.ok(db.prepare("SELECT name FROM pragma_table_info('xbox_connections') WHERE name = 'sync_paused'").get());
  assert.ok(db.prepare("SELECT name FROM pragma_table_info('library_items') WHERE name = 'play_minutes'").get());
  assert.ok(db.prepare("SELECT name FROM pragma_table_info('xbox_titles') WHERE name = 'play_minutes'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'event_games'").get());
  db.close();
});

test("baseline records only the asserted prefix, preserves history, and never executes migration SQL", () => {
  const db = new DatabaseSync(":memory:");
  const names = ["0000_first.sql", "0001_second.sql", "0002_third.sql"];
  db.exec(baselineSql(names, names[0]));
  db.exec("UPDATE d1_migrations SET applied_at = 'original'");
  db.exec(baselineSql(names, names[1]));
  assert.deepEqual(db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => row.name), names.slice(0, 2));
  assert.equal(db.prepare("SELECT applied_at FROM d1_migrations WHERE name = ?").get(names[0])?.applied_at, "original");
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'accounts'").get(), undefined);
  assert.throws(() => baselineSql(names, "unknown.sql"), /exact checked-in/);
  db.close();
});

test("runner rejects SQL missing from the journal and journal entries missing SQL", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rgb-migrations-"));
  try {
    mkdirSync(path.join(directory, "meta"));
    writeFileSync(path.join(directory, "meta/_journal.json"), JSON.stringify({ entries: [{ tag: "0000_first" }] }));
    assert.throws(() => migrationNames(directory), /ordered Drizzle journal/);
    writeFileSync(path.join(directory, "0000_first.sql"), "SELECT 1;");
    assert.deepEqual(migrationNames(directory), ["0000_first.sql"]);
    writeFileSync(path.join(directory, "0001_extra.sql"), "SELECT 1;");
    assert.throws(() => migrationNames(directory), /ordered Drizzle journal/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("Wrangler arguments always target local persisted D1 and reject arbitrary actions", () => {
  for (const action of ["apply", "list"]) {
    const args = migrationArgs(action, "/local/config.json");
    assert.ok(args.includes("--local"));
    assert.ok(!args.includes("--remote"));
    assert.equal(args.at(-1), ".wrangler/state");
  }
  assert.throws(() => migrationArgs("--remote", "config"), /Unsupported/);
});
