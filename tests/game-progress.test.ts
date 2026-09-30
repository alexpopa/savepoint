import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { clearCompleted, markCompleted } from "../lib/completion-queries.ts";
import { insertGameRating, rescoreGameRating } from "../lib/game-rating-queries.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(new URL(name, directory), "utf8"));
  }
  db.exec("INSERT INTO accounts (user_id, email, display_name) VALUES ('one', 'one@example.com', 'One'), ('two', 'two@example.com', 'Two')");
  db.exec("INSERT INTO library_items (id, user_id, igdb_id, name, platform_id, added_at, playing_since) VALUES (1, 'one', 1, 'Game 1', 1, 10, 50), (2, 'one', 1, 'Game 1', 2, 10, NULL), (3, 'two', 1, 'Game 1', 1, 10, NULL)");
  return db;
}
function completed(db: DatabaseSync) {
  return db.prepare("SELECT id, completed_at, playing_since FROM library_items WHERE completed_at IS NOT NULL ORDER BY id").all().map((row) => [row.id, row.completed_at, row.playing_since]);
}

test("completion marks one owned copy, keeps its first time, and leaves currently playing alone", () => {
  const db = database();
  db.prepare(markCompleted).run(1, "one", 100);
  db.prepare(markCompleted).run(1, "one", 200);
  db.prepare(markCompleted).run(3, "one", 100);
  assert.deepEqual(completed(db), [[1, 100, 50]]);
  db.prepare(clearCompleted).run(1, "one");
  db.prepare(markCompleted).run(1, "one", 300);
  assert.deepEqual(completed(db), [[1, 300, 50]]);
  db.close();
});

test("a rating is one score per player and game; rescoring keeps the first rating time", () => {
  const db = database();
  const ratings = () => db.prepare("SELECT user_id, igdb_id, score, rated_at FROM game_ratings ORDER BY user_id, igdb_id").all().map((row) => [row.user_id, row.igdb_id, row.score, row.rated_at]);
  assert.equal(db.prepare(rescoreGameRating).run("one", 1, 4).changes, 0);
  db.prepare(insertGameRating).run("one", 1, "Game 1", null, 2000, 4, 100);
  db.prepare(insertGameRating).run("two", 1, "Game 1", null, 2000, 2, 150);
  assert.equal(db.prepare(rescoreGameRating).run("one", 1, 5).changes, 1);
  db.prepare(insertGameRating).run("one", 1, "Game 1", null, 2000, 3, 200);
  assert.deepEqual(ratings(), [["one", 1, 3, 100], ["two", 1, 2, 150]]);
  assert.throws(() => db.prepare(insertGameRating).run("one", 2, "Game 2", null, null, 6, 100), /CHECK constraint failed/);
  assert.throws(() => db.prepare(insertGameRating).run("one", 2, "Game 2", null, null, 0, 100), /CHECK constraint failed/);
  db.exec("DELETE FROM accounts WHERE user_id = 'two'");
  assert.deepEqual(ratings(), [["one", 1, 3, 100]]);
  db.close();
});
