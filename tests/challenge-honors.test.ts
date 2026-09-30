import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { filterChallenges } from "../lib/challenge-log.ts";
import { awardHonor, honorLimit, placeHonor } from "../lib/challenge-queries.ts";

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
function challenge(db: DatabaseSync, { recipient = "one", done = true, declined = false } = {}) {
  const creator = recipient === "one" ? "two" : "one";
  const result = db.prepare(`INSERT INTO challenges (recipient_id, creator_id, igdb_id, game_name, title, description, created_at, creator_confirmed, recipient_confirmed, declined_at)
    VALUES (?, ?, 1, 'Game', 'Title', 'Description', 100, ?, ?, ?)`).run(recipient, creator, Number(done), Number(done), declined ? 200 : null);
  return Number(result.lastInsertRowid);
}
function award(db: DatabaseSync, id: number, recipient = "one") {
  return Number(db.prepare(awardHonor).run(recipient, id).changes);
}
function hall(db: DatabaseSync, recipient = "one") {
  return db.prepare("SELECT id FROM challenges WHERE recipient_id = ? AND is_favorite = 1 ORDER BY sort_order DESC, id DESC").all(recipient).map((row) => Number(row.id));
}

test("the Hall of Honor takes completed challenges up to the limit, each in the last place", () => {
  const db = database();
  const ids = Array.from({ length: honorLimit + 2 }, () => challenge(db));
  for (const id of ids) award(db, id);
  assert.deepEqual(hall(db), ids.slice(0, honorLimit));
  assert.equal(award(db, ids[0]), 0);
  assert.equal(award(db, challenge(db, { recipient: "two" }), "two"), 1);
  assert.equal(award(db, challenge(db, { done: false }), "one"), 0);
  db.close();
});

test("pending and declined challenges cannot be honored, and a recipient mismatch changes nothing", () => {
  const db = database();
  assert.equal(award(db, challenge(db, { done: false })), 0);
  assert.equal(award(db, challenge(db, { declined: true })), 0);
  assert.equal(award(db, challenge(db), "two"), 0);
  assert.deepEqual(hall(db), []);
  db.close();
});

test("placing an honor shifts the ones between, clamps to the Hall, and untangles legacy shared orders", () => {
  const db = database();
  for (let i = 0; i < 4; i++) challenge(db);
  db.exec("UPDATE challenges SET is_favorite = 1, sort_order = 0");
  const [a, b, c, d] = hall(db);
  const place = db.prepare(placeHonor);
  place.run("one", d, 1);
  assert.deepEqual(hall(db), [d, a, b, c]);
  place.run("one", d, 3);
  assert.deepEqual(hall(db), [a, b, d, c]);
  place.run("one", a, 5);
  assert.deepEqual(hall(db), [b, d, c, a]);
  const added = challenge(db);
  award(db, added);
  assert.deepEqual(hall(db), [b, d, c, a, added]);
  place.run("two", added, 1);
  assert.deepEqual(hall(db).at(-1), added);
  db.close();
});

test("challenge search matches the game, title, or either player, ignoring case and spacing", () => {
  const rows = [
    { id: 1, gameName: "Hearthstone", title: "No Guide Run", creatorName: "Seedy", recipientName: "Alex" },
    { id: 2, gameName: "God of War", title: "One More Run", creatorName: "Player Two", recipientName: "Alex" },
    { id: 3, gameName: "Zelda", title: "Explore 100%", creatorName: "PixelNomad", recipientName: "Sam" },
  ];
  assert.deepEqual(filterChallenges(rows, " run ").map((row) => row.id), [1, 2]);
  assert.deepEqual(filterChallenges(rows, "HEARTH").map((row) => row.id), [1]);
  assert.deepEqual(filterChallenges(rows, "pixel").map((row) => row.id), [3]);
  assert.deepEqual(filterChallenges(rows, "sam").map((row) => row.id), [3]);
  assert.deepEqual(filterChallenges(rows, "%").map((row) => row.id), [3]);
  assert.deepEqual(filterChallenges(rows, "  ").map((row) => row.id), [1, 2, 3]);
});
