import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  saveRecoveredCoverQuery, timelineChallengesQuery, timelineCompletedQuery, timelineFavoritesQuery, timelineLibraryQuery, timelinePlayingQuery, timelineRatingsQuery,
} from "../lib/timeline-queries.ts";

const newest = Number.MAX_SAFE_INTEGER;
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(new URL(name, directory), "utf8"));
  }
  // viewer's accepted friends: friend (private) and zed (public, sorts after viewer); pending, stranger (public), and unverified are not friends.
  db.exec(`INSERT INTO accounts (user_id, email, display_name, is_public, password_hash, email_verified_at) VALUES
    ('viewer', 'v@example.test', 'Viewer', 0, 'h', 1), ('friend', 'f@example.test', 'Friend', 0, 'h', 1),
    ('zed', 'z@example.test', 'Zed', 1, 'h', 1), ('pending', 'p@example.test', 'Pending', 0, 'h', 1),
    ('stranger', 's@example.test', 'Stranger', 1, 'h', 1), ('hidden', 'h@example.test', 'Hidden', 0, 'h', 1),
    ('unverified', 'u@example.test', 'Unverified', 0, 'h', NULL);
    INSERT INTO friendships (user_low, user_high, requester_id, status, created_at) VALUES
    ('friend', 'viewer', 'friend', 'accepted', 1), ('viewer', 'zed', 'zed', 'accepted', 1),
    ('pending', 'viewer', 'pending', 'pending', 1), ('unverified', 'viewer', 'viewer', 'accepted', 1)`);
  const owners = ["friend", "zed", "pending", "stranger", "unverified", "viewer"];
  const add = db.prepare("INSERT INTO library_items (user_id, igdb_id, name, added_at, playing_since, completed_at) VALUES (?, ?, 'Game', ?, ?, ?)");
  const rate = db.prepare("INSERT INTO game_ratings (user_id, igdb_id, name, score, rated_at) VALUES (?, ?, 'Game', 3, ?)");
  const favorite = db.prepare("INSERT INTO game_favorites (user_id, igdb_id, name, favorited_at, sort_order) VALUES (?, ?, 'Game', ?, 0)");
  owners.forEach((owner, index) => {
    for (const at of [100, 200]) {
      add.run(owner, at + index, at + index, at === 200 ? at + index : null, at === 100 ? at + index : null);
      rate.run(owner, at + index, at + index);
      favorite.run(owner, at + index, at + index);
    }
  });
  return db;
}
const owners = (db: DatabaseSync, query: string, ...params: (string | number)[]) =>
  db.prepare(query).all(...params).map((row) => `${row.userId}@${row.at}`);

test("friend activity comes from verified accepted friends only, newest first", () => {
  const db = database();
  for (const query of [timelineLibraryQuery, timelineRatingsQuery, timelineFavoritesQuery]) {
    assert.deepEqual(owners(db, query, "viewer", newest, "{}", 10), ["zed@201", "friend@200", "zed@101", "friend@100"]);
  }
  assert.deepEqual(owners(db, timelinePlayingQuery, "viewer", newest, "{}", 10), ["zed@201", "friend@200"]);
  assert.deepEqual(owners(db, timelineCompletedQuery, "viewer", newest, "{}", 10), ["zed@101", "friend@100"]);
  db.close();
});

test("the cursor, per-friend floors, and limit bound each read", () => {
  const db = database();
  assert.deepEqual(owners(db, timelineLibraryQuery, "viewer", 200, "{}", 10), ["friend@200", "zed@101", "friend@100"]);
  assert.deepEqual(owners(db, timelineRatingsQuery, "viewer", newest, JSON.stringify({ zed: 101 }), 10), ["friend@200", "friend@100"]);
  assert.deepEqual(owners(db, timelineLibraryQuery, "viewer", newest, JSON.stringify({ friend: 100 }), 2), ["zed@201", "zed@101"]);
  db.close();
});

test("challenges need a friend participant, and private strangers hide them except for admins", () => {
  const db = database();
  const challenge = db.prepare(`INSERT INTO challenges (creator_id, recipient_id, igdb_id, game_name, title, description, created_at, timeline_at, declined_at)
    VALUES (?, ?, 1, 'Game', ?, '', 1, ?, ?)`);
  challenge.run("friend", "viewer", "mine", 50, null);
  challenge.run("friend", "zed", "friends", 40, null);
  challenge.run("zed", "stranger", "public stranger", 30, null);
  challenge.run("friend", "hidden", "private stranger", 20, null);
  challenge.run("stranger", "hidden", "no friend", 10, null);
  challenge.run("friend", "zed", "declined", 5, 1);
  const titles = (admin: number) => db.prepare(timelineChallengesQuery).all("viewer", newest, "{}", 10, admin).map((row) => row.title);
  assert.deepEqual(titles(0), ["mine", "friends", "public stranger"]);
  assert.deepEqual(titles(1), ["mine", "friends", "public stranger", "private stranger"]);
  const [mine] = db.prepare(timelineChallengesQuery).all("viewer", newest, "{}", 1, 0);
  assert.deepEqual([mine.creatorUserId, mine.creatorDisplayName, mine.recipientUserId, mine.recipientEmail], ["friend", "Friend", "viewer", "v@example.test"]);
  db.close();
});

test("timeline reads start from the viewer's friends through per-friend indexes", () => {
  const db = database();
  const plan = (query: string, ...params: (string | number)[]) => db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...params).map((row) => String(row.detail)).join("\n");
  assert.match(plan(timelineLibraryQuery, "viewer", newest, "{}", 10), /USING INDEX idx_library_user_added_at/);
  assert.match(plan(timelinePlayingQuery, "viewer", newest, "{}", 10), /USING INDEX idx_library_user_playing_since/);
  assert.match(plan(timelineCompletedQuery, "viewer", newest, "{}", 10), /USING INDEX idx_library_user_completed_at/);
  assert.match(plan(timelineRatingsQuery, "viewer", newest, "{}", 10), /USING INDEX idx_game_ratings_user_rated_at/);
  assert.match(plan(timelineFavoritesQuery, "viewer", newest, "{}", 10), /USING INDEX idx_game_favorites_user_game/);
  for (const query of [timelineLibraryQuery, timelinePlayingQuery, timelineCompletedQuery, timelineRatingsQuery, timelineFavoritesQuery]) {
    assert.doesNotMatch(plan(query, "viewer", newest, "{}", 10), /SCAN row/);
  }
  assert.doesNotMatch(plan(timelineChallengesQuery, "viewer", newest, "{}", 10, 0), /SCAN row/);
  db.close();
});

test("recovered covers fill only missing artwork", () => {
  const db = database();
  db.exec("UPDATE library_items SET cover_url = 'kept' WHERE id = 2");
  db.prepare(saveRecoveredCoverQuery).run(1, "found");
  db.prepare(saveRecoveredCoverQuery).run(2, "found");
  assert.deepEqual(db.prepare("SELECT cover_url FROM library_items WHERE id IN (1, 2) ORDER BY id").all().map((row) => row.cover_url), ["found", "kept"]);
  db.close();
});
