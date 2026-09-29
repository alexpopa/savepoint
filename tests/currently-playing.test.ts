import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { startPlaying, stopPlaying } from "../lib/currently-playing-queries.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(new URL(name, directory), "utf8"));
  }
  db.exec("INSERT INTO library_items (id, user_id, igdb_id, name, platform_id, added_at) VALUES (1, 'one', 1, 'Game 1', 1, 10), (2, 'one', 1, 'Game 1', 2, 10), (3, 'two', 1, 'Game 1', 1, 10)");
  return db;
}
function playing(db: DatabaseSync) {
  return db.prepare("SELECT id, playing_since FROM library_items WHERE playing_since IS NOT NULL ORDER BY id").all();
}

test("each platform copy is marked separately, and repeating a mark keeps its original time", () => {
  const db = database();
  db.prepare(startPlaying).run(1, "one", 100);
  db.prepare(startPlaying).run(2, "one", 200);
  db.prepare(startPlaying).run(1, "one", 300);
  assert.deepEqual(playing(db).map((row) => [row.id, row.playing_since]), [[1, 100], [2, 200]]);
  db.close();
});

test("marks only apply to the owner's copy, clear on stop, and disappear with the copy", () => {
  const db = database();
  db.prepare(startPlaying).run(3, "one", 100);
  assert.equal(playing(db).length, 0);
  db.prepare(startPlaying).run(1, "one", 100);
  db.prepare(startPlaying).run(2, "one", 100);
  db.prepare(stopPlaying).run(1, "one");
  db.prepare(startPlaying).run(1, "one", 400);
  assert.deepEqual(playing(db).map((row) => [row.id, row.playing_since]), [[1, 400], [2, 100]]);
  db.exec("DELETE FROM library_items WHERE id = 2");
  db.exec("UPDATE library_items SET platform_id = 5 WHERE id = 1");
  assert.deepEqual(playing(db).map((row) => [row.id, row.playing_since]), [[1, 400]]);
  db.close();
});
