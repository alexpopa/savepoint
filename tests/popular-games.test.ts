import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { popularGamesQuery } from "../lib/popular-games-query.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE library_items (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    igdb_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    cover_url TEXT,
    release_year INTEGER,
    platforms_json TEXT NOT NULL,
    added_at INTEGER NOT NULL
  )`);
  const insert = db.prepare("INSERT INTO library_items (user_id, igdb_id, name, cover_url, release_year, platforms_json, added_at) VALUES (?, ?, ?, NULL, NULL, '[]', ?)");
  return { db, add: (user: string, game: number, time: number, name = `Game ${game}`) => insert.run(user, game, name, time) };
}

test("popular games count players once across platform copies and return only the six leaders", () => {
  const { db, add } = database();
  add("a", 1, 1010);
  add("a", 1, 1090, "Game 1 updated");
  add("b", 1, 1030);
  add("c", 1, 1040);
  add("a", 2, 1030); add("b", 2, 1040);
  add("a", 3, 1050); add("b", 3, 1060);
  add("a", 4, 1010); add("a", 5, 1020); add("a", 6, 1030);
  add("a", 7, 999); add("b", 7, 999); add("c", 7, 999); add("d", 7, 999);

  const rows = db.prepare(popularGamesQuery).all(1000, 1100) as { igdbId: number; playerCount: number; name: string }[];
  assert.deepEqual(rows.map((row) => [row.igdbId, row.playerCount]), [[1, 3], [3, 2], [2, 2], [6, 1], [5, 1], [4, 1]]);
  assert.equal(rows[0].name, "Game 1 updated");
  db.close();
});

test("the time window includes its start and excludes future adds", () => {
  const { db, add } = database();
  add("a", 1, 1000);
  add("b", 2, 999);
  add("c", 3, 1101);
  const rows = db.prepare(popularGamesQuery).all(1000, 1100) as { igdbId: number }[];
  assert.deepEqual(rows.map((row) => row.igdbId), [1]);
  db.close();
});
