import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { insertGameFavorite, moveGameFavorite } from "../lib/game-favorite-queries.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(new URL(name, directory), "utf8"));
  }
  db.exec("INSERT INTO accounts (user_id, email, display_name) VALUES ('one', 'one@example.test', 'One'), ('two', 'two@example.test', 'Two')");
  return db;
}
function add(db: DatabaseSync, game: number, owner = "one", at = 100) {
  db.prepare(insertGameFavorite).run(owner, game, `Game ${game}`, null, 2000, at);
}
function rows(db: DatabaseSync, owner = "one") {
  return db.prepare("SELECT id, igdb_id, favorited_at FROM game_favorites WHERE user_id = ? ORDER BY sort_order, id").all(owner);
}

test("favorites stop at nine distinct games per player, independently of platform copies", () => {
  const db = database();
  for (let i = 1; i <= 12; i++) add(db, i);
  assert.equal(rows(db).length, 9);
  add(db, 1, "one", 500);
  assert.equal(rows(db).length, 9);
  assert.equal(rows(db)[0].favorited_at, 100);
  add(db, 10, "two");
  assert.equal(rows(db, "two").length, 1);
  db.exec("INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at) VALUES ('one', 1, 'Game 1', 1, 100), ('one', 1, 'Game 1', 2, 100)");
  db.exec("DELETE FROM library_items");
  assert.equal(rows(db).length, 9);
  db.close();
});

test("move arrows swap adjacent favorites, preserve timestamps, and respect boundaries and owners", () => {
  const db = database();
  for (let i = 1; i <= 4; i++) add(db, i);
  add(db, 5, "two");
  const move = db.prepare(moveGameFavorite);
  move.run("one", 2, -1);
  assert.deepEqual(rows(db).map((row) => row.igdb_id), [2, 1, 3, 4]);
  move.run("one", 2, -1);
  move.run("one", 4, 1);
  assert.deepEqual(rows(db).map((row) => row.igdb_id), [2, 1, 3, 4]);
  move.run("one", 2, 1);
  assert.deepEqual(rows(db).map((row) => row.igdb_id), [1, 2, 3, 4]);
  move.run("one", 5, -1);
  assert.deepEqual(rows(db, "two").map((row) => row.igdb_id), [5]);
  assert.ok(rows(db).every((row) => row.favorited_at === 100));
  db.exec("DELETE FROM game_favorites WHERE igdb_id = 2 AND user_id = 'one'");
  move.run("one", 3, -1);
  assert.deepEqual(rows(db).map((row) => row.igdb_id), [3, 1, 4]);
  add(db, 2, "one", 900);
  assert.deepEqual(rows(db).map((row) => row.igdb_id), [3, 1, 4, 2]);
  assert.equal(rows(db)[3].favorited_at, 900);
  db.close();
});

test("removing a favorite frees a slot; repeated adds do not reorder or bump activity", () => {
  const db = database();
  for (let i = 1; i <= 9; i++) add(db, i);
  db.exec("DELETE FROM game_favorites WHERE igdb_id = 4");
  add(db, 10, "one", 500);
  add(db, 10, "one", 600);
  assert.deepEqual(rows(db).map((row) => row.igdb_id), [1, 2, 3, 5, 6, 7, 8, 9, 10]);
  assert.equal(rows(db)[8].favorited_at, 500);
  db.close();
});
