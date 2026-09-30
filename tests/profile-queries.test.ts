import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { receivedChallengesQuery, sentChallengesQuery } from "../lib/challenge-queries.ts";
import { currentlyPlayingQuery } from "../lib/currently-playing-queries.ts";
import { gameFavoritesQuery } from "../lib/game-favorite-queries.ts";
import { libraryStatsQuery, profileAccountQuery } from "../lib/profile-queries.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(new URL(name, directory), "utf8"));
  }
  db.exec(`INSERT INTO accounts (user_id, email, display_name, is_public, password_hash, email_verified_at) VALUES
    ('one', 'one@example.test', 'One', 1, 'hash', 1), ('two', 'two@example.test', 'Two', 0, 'hash', 1), ('three', 'three@example.test', 'Three', 0, NULL, NULL)`);
  return db;
}
function challenge(db: DatabaseSync, { recipient = "one", creator = "two", game = 1, cover = null as string | null, declined = false } = {}) {
  return Number(db.prepare(`INSERT INTO challenges (recipient_id, creator_id, igdb_id, game_name, game_cover_url, title, description, created_at, declined_at)
    VALUES (?, ?, ?, 'Game', ?, 'Title', 'Description', 100, ?)`).run(recipient, creator, game, cover, declined ? 200 : null).lastInsertRowid);
}
function copy(db: DatabaseSync, user: string, game: number, platform: number, cover: string | null, addedAt: number, extra: { playing?: number; completed?: number } = {}) {
  db.prepare(`INSERT INTO library_items (user_id, igdb_id, name, cover_url, platform_id, added_at, playing_since, completed_at) VALUES (?, ?, 'Game', ?, ?, ?, ?, ?)`)
    .run(user, game, cover, platform, addedAt, extra.playing ?? null, extra.completed ?? null);
}

test("challenge lists carry both players and skip declined challenges only for the recipient", () => {
  const db = database();
  const kept = challenge(db);
  const declined = challenge(db, { declined: true });
  const sent = challenge(db, { recipient: "two", creator: "one" });
  const received = db.prepare(receivedChallengesQuery).all("one");
  assert.deepEqual(received.map((row) => row.id), [kept]);
  assert.equal(received[0].creatorDisplayName, "Two");
  assert.equal(received[0].recipientEmail, "one@example.test");
  assert.equal(received[0].declined, 0);
  assert.deepEqual(db.prepare(sentChallengesQuery).all("two").map((row) => [row.id, row.declined]), [[declined, 1], [kept, 0]]);
  assert.deepEqual(db.prepare(sentChallengesQuery).all("one").map((row) => row.id), [sent]);
  db.close();
});

test("a challenge shows the newest library cover for its game, then its own snapshot", () => {
  const db = database();
  const snapshot = challenge(db, { game: 1, cover: "snapshot.jpg" });
  const bare = challenge(db, { game: 2 });
  const covered = challenge(db, { game: 3, cover: "old.jpg" });
  copy(db, "two", 3, 1, "older.jpg", 10);
  copy(db, "three", 3, 2, "newest.jpg", 30);
  copy(db, "one", 3, 3, null, 40);
  copy(db, "two", 2, 1, "", 50);
  const covers = new Map(db.prepare(receivedChallengesQuery).all("one").map((row) => [row.id, row.gameCoverUrl]));
  assert.equal(covers.get(snapshot), "snapshot.jpg");
  assert.equal(covers.get(bare), null);
  assert.equal(covers.get(covered), "newest.jpg");
  db.close();
});

test("profile reads return the owner's favorites, playing copies, and distinct game counts", () => {
  const db = database();
  copy(db, "one", 1, 1, null, 10, { playing: 100, completed: 5 });
  copy(db, "one", 1, 2, null, 20, { completed: 6 });
  copy(db, "one", 2, 1, null, 30, { playing: 200 });
  copy(db, "two", 3, 1, null, 40, { playing: 300, completed: 7 });
  const favorite = db.prepare("INSERT INTO game_favorites (user_id, igdb_id, name, favorited_at, sort_order) VALUES (?, ?, 'Game', 1, ?)");
  favorite.run("one", 1, 1); favorite.run("one", 2, 0); favorite.run("two", 3, 0);
  assert.deepEqual(db.prepare(gameFavoritesQuery).all("one").map((row) => row.igdbId), [2, 1]);
  assert.deepEqual(db.prepare(currentlyPlayingQuery).all("one").map((row) => [row.igdbId, row.playingSince]), [[2, 200], [1, 100]]);
  assert.deepEqual({ ...db.prepare(libraryStatsQuery).get("one") }, { games: 2, completed: 1 });
  assert.deepEqual({ ...db.prepare(profileAccountQuery).get("one") }, { isPublic: 1, verified: 1 });
  assert.deepEqual({ ...db.prepare(profileAccountQuery).get("three") }, { isPublic: 0, verified: 0 });
  db.close();
});
