import { test } from "node:test";
import assert from "node:assert/strict";
import { batchLibraryGames, recentTimeline, BATCH_WINDOW, type TimelineGame, type TimelineChallenge } from "../lib/timeline-items.ts";

const person = { id: "friend", name: "Friend", href: "/users/Friend" };
const game = (id: number, addedAt: number, owner = person): TimelineGame => ({ id, igdbId: id, addedAt, person: owner, name: "Game", releaseYear: null, platformName: "SNES", coverUrl: null });

test("24-hour batches include the boundary without chaining backward", () => {
  const batches = batchLibraryGames([game(3, 0), game(2, BATCH_WINDOW), game(1, BATCH_WINDOW * 2)]);
  assert.deepEqual(batches.map((batch) => batch.games.map((row) => row.id)), [[1, 2], [3]]);
});
test("friends stay separate, duplicate timestamps and platform copies remain deterministic", () => {
  const batches = batchLibraryGames([game(1, 50), game(3, 50), game(2, 50, { ...person, id: "other" })]);
  assert.deepEqual(batches.map((batch) => batch.games.map((row) => row.id)), [[3, 1], [2]]);
});
test("a large import occupies one slot, with no truncated batch", () => {
  const games = Array.from({ length: 200 }, (_, i) => game(i, i));
  const rows = recentTimeline(games, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind === "library" && rows[0].games.length, 200);
});
test("limit is applied after grouping and merging challenge updates", () => {
  const games = Array.from({ length: 40 }, (_, i) => game(i, i * BATCH_WINDOW * 2));
  const challenge: TimelineChallenge = { kind: "challenge", key: "challenge:1", id: 1, at: 100 * BATCH_WINDOW, createdAt: 0, title: "Challenge", description: "Description", gameName: "Game", coverUrl: null, creator: person, recipient: person, state: "completed" };
  const rows = recentTimeline(games, [challenge]);
  assert.equal(rows.length, 30);
  assert.equal(rows[0], challenge);
  assert.equal(rows[1].at, 78 * BATCH_WINDOW);
});
test("deleting a newest copy recalculates the batch from remaining additions", () => {
  const batches = batchLibraryGames([game(2, BATCH_WINDOW), game(3, 0)]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].at, BATCH_WINDOW);
});

test("game favorites merge by favorite time and share the thirty-entry limit", () => {
  const favorite = { kind: "favorite" as const, key: "favorite:1", at: 100 * BATCH_WINDOW, person, igdbId: 1, name: "Game", coverUrl: null, releaseYear: 2000 };
  const games = Array.from({ length: 40 }, (_, i) => game(i, i * BATCH_WINDOW * 2));
  const rows = recentTimeline(games, [], [favorite]);
  assert.equal(rows.length, 30);
  assert.equal(rows[0], favorite);
  assert.equal(recentTimeline([], [], []).length, 0);
});

test("currently playing adds one entry per platform copy, outside library batches", () => {
  const playing = (id: number, at: number, platformName: string) => ({ kind: "playing" as const, key: `playing:${id}`, at, person, igdbId: 1, name: "Game", coverUrl: null, releaseYear: 2000, platformName });
  const rows = recentTimeline([game(1, 10), game(2, 10)], [], [], [playing(1, 50, "SNES"), playing(2, 40, "N64")]);
  assert.deepEqual(rows.map((row) => row.key), ["playing:1", "playing:2", "library:2"]);
  assert.equal(rows[2].kind === "library" && rows[2].games.length, 2);
});
