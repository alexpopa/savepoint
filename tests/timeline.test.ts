import { test } from "node:test";
import assert from "node:assert/strict";
import { batchLibraryGames, batchRatings, mergeTimeline, parseTimelineCursor, timelinePage, BATCH_WINDOW, type TimelineChallenge, type TimelineCursor, type TimelineGame, type TimelineItem, type TimelineRating, type TimelineSources } from "../lib/timeline-items.ts";

const person = { id: "friend", name: "Friend", href: "/users/Friend" };
const complete = <T>(rows: T[]) => ({ rows, truncated: false });
const fullSources = (games: TimelineGame[], challenges: TimelineChallenge[]): TimelineSources => ({
  games: complete(games), challenges: complete(challenges), favorites: complete([]), playing: complete([]), completed: complete([]), ratings: complete([]),
});
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
  const rows = mergeTimeline(games, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind === "library" && rows[0].games.length, 200);
});
test("library pages count the complete batch but send at most the newest 100 games", () => {
  for (const count of [4, 5, 99, 100, 101, 200]) {
    const games = Array.from({ length: count }, (_, i) => game(i + 1, i));
    const page = timelinePage(fullSources(games, []), null)!;
    assert.equal(page.items.length, 1);
    const batch = page.items[0];
    assert.equal(batch.kind, "library");
    if (batch.kind !== "library") return;
    assert.equal(batch.gameCount, count);
    assert.deepEqual(batch.games.map((row) => row.id), games.slice().reverse().slice(0, 100).map((row) => row.id));
    assert.equal(page.next, null);
  }
});
test("capping an import still waits for its full count and skips its remaining games on later pages", () => {
  const games = [game(1, 0), ...Array.from({ length: 150 }, (_, i) => game(i + 2, BATCH_WINDOW * 2))];
  const all = { games, ratings: [], challenges: [] };
  assert.equal(timelinePage(readSources(all, null, 16, 100), null, 1), null);
  const first = timelinePage(readSources(all, null, 16, 400), null, 1)!;
  assert.equal(first.items[0].kind === "library" && first.items[0].gameCount, 150);
  assert.equal(first.items[0].kind === "library" && first.items[0].games.length, 100);
  const cursor = parseTimelineCursor(first.next!);
  assert.ok(cursor);
  const second = timelinePage(readSources(all, cursor, 16, 100), cursor, 1)!;
  assert.deepEqual(second.items.map((item) => item.key), ["library:1"]);
  assert.equal(second.next, null);
});
test("the page limit is applied after grouping and merging challenge updates", () => {
  const games = Array.from({ length: 40 }, (_, i) => game(i, i * BATCH_WINDOW * 2));
  const challenge: TimelineChallenge = { kind: "challenge", key: "challenge:1", id: 1, at: 100 * BATCH_WINDOW, createdAt: 0, title: "Challenge", description: "Description", gameName: "Game", coverUrl: null, creator: person, recipient: person, state: "completed" };
  const { items, next } = timelinePage(fullSources([...games].reverse(), [challenge]), null, 30)!;
  assert.equal(items.length, 30);
  assert.equal(items[0], challenge);
  assert.equal(items[1].at, 78 * BATCH_WINDOW);
  assert.ok(next);
});
test("deleting a newest copy recalculates the batch from remaining additions", () => {
  const batches = batchLibraryGames([game(2, BATCH_WINDOW), game(3, 0)]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].at, BATCH_WINDOW);
});

test("game favorites merge by favorite time and share the page limit", () => {
  const favorite = { kind: "favorite" as const, key: "favorite:1", at: 100 * BATCH_WINDOW, person, igdbId: 1, name: "Game", coverUrl: null, releaseYear: 2000 };
  const games = Array.from({ length: 40 }, (_, i) => game(i, i * BATCH_WINDOW * 2));
  const rows = mergeTimeline(games, [], [favorite]);
  assert.equal(rows.length, 41);
  assert.equal(rows[0], favorite);
  assert.deepEqual(timelinePage(fullSources([], []), null), { items: [], next: null });
});

test("currently playing adds one entry per platform copy, outside library batches", () => {
  const playing = (id: number, at: number, platformName: string) => ({ kind: "playing" as const, key: `playing:${id}`, at, person, igdbId: 1, name: "Game", coverUrl: null, releaseYear: 2000, platformName });
  const rows = mergeTimeline([game(1, 10), game(2, 10)], [], [], [playing(1, 50, "SNES"), playing(2, 40, "N64")]);
  assert.deepEqual(rows.map((row) => row.key), ["playing:1", "playing:2", "library:2"]);
  assert.equal(rows[2].kind === "library" && rows[2].games.length, 2);
});

test("completed copies get their own entries, and ratings batch per friend like library additions", () => {
  const completed = { kind: "completed" as const, key: "completed:1", at: 5 * BATCH_WINDOW, person, igdbId: 1, name: "Game", coverUrl: null, releaseYear: 2000, platformName: "SNES" };
  const rating = (id: number, ratedAt: number, owner = person) => ({ id, igdbId: id, name: "Game", releaseYear: null, coverUrl: null, score: 4, ratedAt, person: owner });
  const batches = batchRatings([rating(3, 0), rating(2, BATCH_WINDOW), rating(1, BATCH_WINDOW * 2), rating(4, BATCH_WINDOW * 2, { ...person, id: "other" })]);
  assert.deepEqual(batches.map((batch) => [batch.key, batch.games.map((row) => row.id)]), [["ratings:4", [4]], ["ratings:1", [1, 2]], ["ratings:3", [3]]]);
  const rows = mergeTimeline([game(1, 10)], [], [], [], [completed], [rating(1, BATCH_WINDOW * 2), rating(2, BATCH_WINDOW)]);
  assert.deepEqual(rows.map((row) => row.key), ["completed:1", "ratings:1", "library:1"]);
});

// Mirrors the SQL in lib/timeline.ts: rows at or before the cursor, below each friend's floor, newest first, limited.
function readSources(all: { games: TimelineGame[]; ratings: TimelineRating[]; challenges: TimelineChallenge[] }, cursor: TimelineCursor | null, single: number, batched: number): TimelineSources {
  const read = <T>(rows: T[], at: (row: T) => number, id: (row: T) => number, limit: number, keep: (row: T) => boolean = () => true) => {
    const result = rows.filter((row) => (!cursor || at(row) <= cursor.at) && keep(row)).sort((a, b) => at(b) - at(a) || id(b) - id(a)).slice(0, limit);
    return { rows: result, truncated: result.length === limit };
  };
  const belowFloor = (floors: Record<string, number> | undefined) => (row: { person: { id: string } }, at: number) => floors?.[row.person.id] === undefined || at < floors[row.person.id];
  return {
    games: read(all.games, (row) => row.addedAt, (row) => row.id, batched, (row) => belowFloor(cursor?.library)(row, row.addedAt)),
    ratings: read(all.ratings, (row) => row.ratedAt, (row) => row.id, batched, (row) => belowFloor(cursor?.ratings)(row, row.ratedAt)),
    challenges: read(all.challenges, (row) => row.at, (row) => row.id, single),
    favorites: complete([]), playing: complete([]), completed: complete([]),
  };
}

test("paging with small reads shows every entry once, with the same batches as the whole timeline", () => {
  const other = { ...person, id: "other" };
  const hour = BATCH_WINDOW / 24;
  // Chained batches straddle page boundaries, including a large import and duplicate timestamps.
  const games = [
    ...Array.from({ length: 30 }, (_, i) => game(i + 1, 100 * hour - i * 10 * hour)),
    ...Array.from({ length: 25 }, (_, i) => game(100 + i, 60 * hour)),
    ...Array.from({ length: 20 }, (_, i) => game(200 + i, 95 * hour - i * 7 * hour, other)),
  ];
  const ratings = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, igdbId: i + 1, name: "Game", releaseYear: null, coverUrl: null, score: 3, ratedAt: 90 * hour - i * 13 * hour, person: other }));
  const challenges = Array.from({ length: 9 }, (_, i): TimelineChallenge => ({ kind: "challenge", key: `challenge:${i + 1}`, id: i + 1, at: 80 * hour - i * 20 * hour, createdAt: 0, title: "Challenge", description: "", gameName: "Game", coverUrl: null, creator: person, recipient: other, state: "pending" }));
  const expected = mergeTimeline(games, challenges, [], [], [], ratings);
  const shown: TimelineItem[] = [];
  let cursor: TimelineCursor | null = null;
  for (let pages = 0; pages < 50; pages++) {
    let page = null;
    for (let single = 4, batched = 3; !page; single *= 4, batched *= 4) page = timelinePage(readSources({ games, ratings, challenges }, cursor, single, batched), cursor, 3);
    shown.push(...page.items);
    if (!page.next) break;
    cursor = parseTimelineCursor(page.next);
    assert.ok(cursor);
  }
  assert.deepEqual(shown.map((item) => [item.key, "games" in item ? item.games.map((row) => row.id) : []]), expected.map((item) => [item.key, "games" in item ? item.games.map((row) => row.id) : []]));
});

test("timeline cursors reject malformed input", () => {
  assert.deepEqual(parseTimelineCursor(JSON.stringify({ at: 5, key: "library:3", library: { friend: 1 }, ratings: {} })), { at: 5, key: "library:3", library: { friend: 1 }, ratings: {} });
  for (const raw of ["", "{", "null", "[]", JSON.stringify({ at: 1.5, key: "library:3", library: {}, ratings: {} }), JSON.stringify({ at: 5, key: "other:3", library: {}, ratings: {} }), JSON.stringify({ at: 5, key: "library:3", library: { friend: "1" }, ratings: {} }), JSON.stringify({ at: 5, key: "library:3", library: [] , ratings: {} })])
    assert.equal(parseTimelineCursor(raw), null, raw);
});
