import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { siteStatsQuery } from "../lib/admin-queries.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(new URL(name, directory), "utf8"));
  }
  return db;
}

test("an empty site reports zero for every counter", () => {
  const db = database();
  const stats = db.prepare(siteStatsQuery).get(0, 1000) as Record<string, number>;
  assert.ok(Object.keys(stats).length > 0);
  for (const [key, value] of Object.entries(stats)) assert.equal(value, 0, key);
  db.close();
});

test("site stats count verified players, library marks, social records, and the recent window", () => {
  const db = database();
  db.exec(`INSERT INTO accounts (user_id, email, display_name, is_public, password_hash, email_verified_at) VALUES
    ('one', 'one@example.test', 'One', 1, 'hash', 1), ('two', 'two@example.test', 'Two', 0, 'hash', 1),
    ('three', 'three@example.test', 'Three', 0, 'hash', NULL), ('legacy', 'legacy@example.test', 'Legacy', 1, NULL, NULL)`);
  db.exec(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('a', 'one', 2000), ('b', 'one', 3000), ('c', 'two', 500)`);
  db.exec(`INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at, playing_since, completed_at) VALUES
    ('one', 1, 'Game', 1, 100, 100, NULL), ('one', 1, 'Game', 2, 900, NULL, 950), ('two', 2, 'Other', 1, 950, NULL, NULL)`);
  db.exec(`INSERT INTO game_favorites (user_id, igdb_id, name, favorited_at, sort_order) VALUES ('one', 1, 'Game', 100, 1)`);
  db.exec(`INSERT INTO game_ratings (user_id, igdb_id, name, score, rated_at) VALUES ('one', 1, 'Game', 5, 100), ('two', 2, 'Other', 3, 900)`);
  db.exec(`INSERT INTO challenges (recipient_id, creator_id, igdb_id, game_name, title, description, created_at, creator_confirmed, recipient_confirmed) VALUES
    ('one', 'two', 1, 'Game', 'Clear', 'Done', 100, 1, 1), ('two', 'one', 2, 'Other', 'Open', 'Half', 900, 1, 0)`);
  db.exec(`INSERT INTO friendships (user_low, user_high, requester_id, status, created_at) VALUES
    ('one', 'two', 'one', 'accepted', 100), ('one', 'three', 'three', 'pending', 900)`);
  const stats = db.prepare(siteStatsQuery).get(800, 1000);
  assert.deepEqual({ ...stats }, {
    players: 2, publicPlayers: 1, unverified: 1, signedIn: 1,
    games: 2, copies: 3, playing: 1, completed: 1, favorites: 1, ratings: 2,
    challenges: 2, clearedChallenges: 1, friendships: 1, pendingRequests: 1,
    recentCopies: 2, recentChallenges: 1, recentRatings: 1, recentFriendships: 1,
  });
  db.close();
});
