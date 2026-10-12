import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  fetchCompletionProgress, fetchRaProfile, mergeRaGames, parseCompletionProgress, parseGameProgress, parseRaAwards, parseRecentlyPlayed, RaError, raTime, type RaProgress,
} from "../lib/ra-api.ts";
import { defaultRaPlatform, raPlatforms, raSubset, raTitleName, raTitleVariants, validRaGameId, validRaUsername } from "../lib/ra-types.ts";
import {
  acquireRaLock, attachRaGame, finishRaAchievements, importRaGame, linkRaConnection, playRaGame, raAchievementListQuery, raCounts, raPage, raShowcaseQuery, raShowcaseTotals,
  readyRaGames, removeRaCopies, saveRaAchievement, saveRaGame, saveRaUnlock, setRaMatch, staleRaAchievements,
} from "../lib/ra-queries.ts";
import { timelineBeatenQuery, timelineRaUnlocksQuery } from "../lib/timeline-queries.ts";
import { batchRaUnlocks, parseTimelineCursor, timelinePage, BATCH_WINDOW, type TimelineRaUnlock } from "../lib/timeline-items.ts";
import type { CatalogGame } from "../lib/game-types.ts";

const catalog = (ids: number[]): CatalogGame => ({ igdbId: 42, name: "Catalog game", coverUrl: null, releaseYear: 1992, platforms: [], platformOptions: ids.map((id) => ({ id, name: `P${id}` })) });
const progress = (gameId: number, title: string, extra: Partial<RaProgress> = {}): RaProgress => ({ gameId, title, consoleId: 5, consoleName: "Game Boy Advance", imageUrl: null,
  total: 10, earned: 4, earnedHardcore: 4, lastAwardedAt: 1000, awardKind: null, awardAt: null, ...extra });
const noAwards = () => parseRaAwards({});
const ulid = "01A7ZWK9Z6K4S6WNNNA418A60H";

test("profiles, game lists, awards, and recent play parse RA's formats and drop invalid rows", () => {
  assert.equal(raTime("2016-03-12 17:47:29"), Date.UTC(2016, 2, 12, 17, 47, 29));
  assert.equal(raTime("2023-10-27T02:52:34+00:00"), Date.UTC(2023, 9, 27, 2, 52, 34));
  assert.equal(raTime("soon"), null);
  const games = parseCompletionProgress([{ Results: [
    { GameID: 764, Title: "Final Fantasy V: Advance", ImageIcon: "/Images/074181.png", ConsoleID: 5, ConsoleName: "Game Boy Advance", MaxPossible: 172, NumAwarded: 135,
      NumAwardedHardcore: 135, MostRecentAwardedDate: "2026-06-21T01:52:25+00:00", HighestAwardKind: "beaten-hardcore", HighestAwardDate: "2023-01-01T00:00:00+00:00" },
    { GameID: 764, Title: "Duplicate", ConsoleID: 5 },
    { GameID: "bad", Title: "Broken", ConsoleID: 5 },
    { GameID: 9, Title: "Odd", ConsoleID: 1, ImageIcon: "https://evil.example/x.png", HighestAwardKind: "legendary" },
  ] }]);
  assert.deepEqual(games.map((game) => [game.gameId, game.imageUrl, game.awardKind]), [[764, "https://media.retroachievements.org/Images/074181.png", "beaten-hardcore"], [9, null, null]]);
  const awards = parseRaAwards({ BeatenHardcoreAwardsCount: 3, BeatenSoftcoreAwardsCount: 1, MasteryAwardsCount: 2, CompletionAwardsCount: 0, VisibleUserAwards: [
    { AwardType: "Game Beaten", AwardData: 764, AwardDataExtra: 0, AwardedAt: "2023-01-01T00:00:00+00:00" },
    { AwardType: "Game Beaten", AwardData: 764, AwardDataExtra: 1, AwardedAt: "2023-02-01T00:00:00+00:00" },
    { AwardType: "Mastery/Completion", AwardData: 764, AwardDataExtra: 1, AwardedAt: "2023-03-01T00:00:00+00:00" },
    { AwardType: "Event", AwardData: 99, AwardDataExtra: 1, AwardedAt: "2023-03-01T00:00:00+00:00" },
  ] });
  assert.deepEqual(awards.totals, { beatenHardcore: 3, beatenSoftcore: 1, mastered: 2, completed: 0 });
  assert.deepEqual(awards.games.get(764), { beatenAt: Date.UTC(2023, 0, 1), beatenHardcore: true, masteredAt: Date.UTC(2023, 2, 1), masteredHardcore: true });
  assert.equal(awards.games.has(99), false);
  assert.deepEqual([...parseRecentlyPlayed([{ GameID: 764, LastPlayed: "2026-10-12 20:47:45" }, { GameID: 0, LastPlayed: "2026-10-12 20:47:45" }])], [[764, Date.UTC(2026, 9, 12, 20, 47, 45)]]);
});

test("achievement lists keep the first earned time, mark hardcore, and compute rarity from distinct players", () => {
  const list = parseGameProgress({ Title: "Game [Subset - Bonus]", NumDistinctPlayers: 200, UserTotalPlaytime: 7200, Achievements: {
    1: { ID: 1, Title: "First", Description: "Do it", Points: 5, BadgeName: "250336", DisplayOrder: 2, NumAwarded: 50, DateEarned: "2024-01-02 00:00:00", DateEarnedHardcore: "2024-01-02 00:00:00" },
    2: { ID: 2, Title: "Soft", Points: 10, BadgeName: "../x", NumAwarded: 300, DateEarned: "2024-01-03 00:00:00" },
    3: { ID: 3, Title: "Locked", Points: 25, NumAwarded: 1 },
    4: { ID: "x", Title: "Broken" },
  } });
  assert.equal(list.title, "Game [Subset - Bonus]");
  assert.equal(list.playSeconds, 7200);
  assert.deepEqual(list.achievements.map((entry) => [entry.id, entry.badgeUrl, entry.rarity]), [[1, "https://media.retroachievements.org/Badge/250336.png", 250], [2, null, 1000], [3, null, 5]]);
  assert.deepEqual(list.earned, [{ id: 1, earnedAt: Date.UTC(2024, 0, 2), hardcore: true }, { id: 2, earnedAt: Date.UTC(2024, 0, 3), hardcore: false }]);
});

test("subsets fold into their main game by parent ID or same title, and orphans ask for a parent lookup", () => {
  const rows = [progress(764, "Final Fantasy V: Advance", { lastAwardedAt: 100 }), progress(24371, "Final Fantasy V: Advance [Subset - Four Job Fiesta]", { total: 223, earned: 223, earnedHardcore: 223, lastAwardedAt: 300 }),
    progress(18495, "Makai Toushi SaGa [Subset - Solo Class]", { consoleId: 53, consoleName: "WonderSwan" }), progress(500, "Standalone Game", { consoleId: 102, consoleName: "Standalone" })];
  const first = mergeRaGames(rows, noAwards(), new Map([[764, 900]]), new Map());
  assert.deepEqual(first.unplaced, [18495]);
  const main = first.games.find((game) => game.gameId === 764)!;
  assert.deepEqual([main.subsetIds, main.total, main.earned, main.lastPlayedAt], [[24371], 233, 227, 900]);
  // A subset whose main game was never played becomes the main game's row, named from its base title.
  const second = mergeRaGames(rows, noAwards(), new Map(), new Map([[18495, 18000]]));
  assert.deepEqual(second.unplaced, []);
  const orphan = second.games.find((game) => game.gameId === 18000)!;
  assert.deepEqual([orphan.name, orphan.subsetIds, orphan.consoleName], ["Makai Toushi SaGa", [18495], "WonderSwan"]);
  assert.equal(second.games.length, 3);
  assert.deepEqual(raSubset("Game [Subset - Bonus]"), { base: "Game", name: "Bonus" });
  assert.equal(raSubset("Game"), null);
});

test("completion is the first beaten time in either mode, then mastery, then RA's highest award when awards are hidden", () => {
  const beaten = parseRaAwards({ VisibleUserAwards: [{ AwardType: "Game Beaten", AwardData: 1, AwardDataExtra: 0, AwardedAt: "2023-01-01T00:00:00+00:00" },
    { AwardType: "Mastery/Completion", AwardData: 2, AwardDataExtra: 1, AwardedAt: "2023-05-01T00:00:00+00:00" }] });
  const rows = [progress(1, "Beaten"), progress(2, "Mastered only"), progress(3, "Hidden award", { awardKind: "beaten-hardcore", awardAt: 5000 }), progress(4, "Unfinished"),
    progress(1001, "Beaten [Subset - Bonus]", { awardKind: "mastered", awardAt: 7000 })];
  const games = new Map(mergeRaGames(rows, beaten, new Map(), new Map()).games.map((game) => [game.gameId, game]));
  assert.deepEqual([games.get(1)!.completedAt, games.get(1)!.completedHardcore], [Date.UTC(2023, 0, 1), false]);
  assert.deepEqual([games.get(2)!.completedAt, games.get(2)!.completedHardcore], [Date.UTC(2023, 4, 1), true]);
  assert.deepEqual([games.get(3)!.completedAt, games.get(3)!.completedHardcore], [5000, true]);
  assert.deepEqual([games.get(4)!.completedAt, games.get(4)!.completedHardcore], [null, false]);
});

test("requests send the site key and identify RGBoner, page to the total, and map RA errors", async () => {
  const seen: URL[] = [];
  const results = (count: number, start: number) => Array.from({ length: count }, (_, index) => ({ GameID: start + index + 1, Title: `G${start + index}`, ConsoleID: 1 }));
  const games = await fetchCompletionProgress(ulid, "key", async (input, init) => {
    const url = new URL(String(input));
    seen.push(url);
    assert.equal(new Headers(init?.headers).get("user-agent"), "RGBoner/1.0");
    assert.equal(init?.redirect, "manual");
    const offset = Number(url.searchParams.get("o"));
    return Response.json({ Count: 500, Total: 700, Results: results(offset ? 200 : 500, offset) });
  });
  assert.equal(games.length, 700);
  assert.deepEqual(seen.map((url) => [url.pathname, url.searchParams.get("u"), url.searchParams.get("y"), url.searchParams.get("o")]),
    [["/API/API_GetUserCompletionProgress.php", ulid, "key", "0"], ["/API/API_GetUserCompletionProgress.php", ulid, "key", "500"]]);
  await assert.rejects(fetchRaProfile("nobody", "key", async () => Response.json([], { status: 404 })), (error: unknown) => error instanceof RaError && error.status === 404);
  await assert.rejects(fetchRaProfile("someone", "key", async () => Response.json({ message: "Unauthenticated." }, { status: 401 })), /API key/);
  await assert.rejects(fetchRaProfile("someone", "key", async () => Response.json({ User: "someone" })), (error: unknown) => error instanceof RaError && error.status === 404);
  const profile = await fetchRaProfile("someone", "key", async () => Response.json({ User: "Someone", ULID: ulid, Motto: "hi RGB-ABCD2345", TotalPoints: 10, TotalSoftcorePoints: 2, TotalTruePoints: 30 }));
  assert.deepEqual(profile, { ulid, username: "Someone", motto: "hi RGB-ABCD2345", hardcorePoints: 10, softcorePoints: 2, retroPoints: 30 });
});

test("titles become IGDB lookups without tags, with articles moved and colons dropped", () => {
  assert.deepEqual(raTitleVariants("Legend of Zelda, The: A Link to the Past"),
    ["Legend of Zelda, The: A Link to the Past", "Legend of Zelda, The A Link to the Past", "The Legend of Zelda: A Link to the Past", "The Legend of Zelda A Link to the Past"]);
  assert.deepEqual(raTitleVariants("~Hack~ ~Prototype~ Super Metroid: X-Fusion"), ["Super Metroid: X-Fusion", "Super Metroid X-Fusion"]);
  assert.deepEqual(raTitleVariants("Pokemon Red Version | Pokemon Blue Version"), ["Pokemon Red Version", "Pokemon Blue Version"]);
  assert.equal(raTitleName("Pokémon: Zany Cards!"), "pokemon zany cards");
  assert.ok(validRaUsername("MaxMilyin") && !validRaUsername("a") && !validRaUsername("bad name") && !validRaUsername(7));
  assert.ok(validRaGameId(764) && !validRaGameId(0) && !validRaGameId("764"));
});

test("the platform default is the game's own console, keeping an existing copy, before any other supported platform", () => {
  assert.deepEqual(raPlatforms(catalog([19, 6, 58])).map((platform) => platform.id), [19, 58]);
  assert.equal(defaultRaPlatform(catalog([19, 58]), 3), 19);
  assert.equal(defaultRaPlatform(catalog([19, 58]), 3, [58]), 58);
  // A Game Boy Advance game matched to a release that is only on SNES still has a supported platform.
  assert.equal(defaultRaPlatform(catalog([19]), 5), 19);
  assert.equal(defaultRaPlatform(catalog([6]), 5), 0);
});

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) db.exec(readFileSync(new URL(name, directory), "utf8"));
  db.exec(`INSERT INTO accounts (user_id, email, display_name, password_hash, email_verified_at) VALUES ('one', 'one@example.test', 'One', 'h', 1), ('two', 'two@example.test', 'Two', 'h', 1);
    INSERT INTO friendships (user_low, user_high, requester_id, status, created_at) VALUES ('one', 'two', 'one', 'accepted', 1);
    INSERT INTO ra_connections (user_id, connection_id, ulid, username, linked_at, synced_at, lock_token, lock_until) VALUES ('one', 'connection', '${ulid}', 'Tester', 1, 100, 'lease', 10000)`);
  return db;
}
function run(db: DatabaseSync, query: string, values: (string | number | null)[]) {
  return db.prepare(query).run(Object.fromEntries(values.map((value, index) => [String(index + 1), value])));
}
type Save = { gameId?: number; subsets?: number[]; earned?: number; hardcore?: number; total?: number; token?: string; at?: number; played?: number | null; completed?: number | null; completedHardcore?: number };
function save(db: DatabaseSync, { gameId = 764, subsets = [], earned = 2, hardcore = 1, total = 3, token = "lease", at = 100, played = 900, completed = null, completedHardcore = 0 }: Save = {}) {
  return run(db, saveRaGame, ["connection", token, gameId, JSON.stringify(subsets), `Game ${gameId}`, 3, "SNES/Super Famicom", null, earned, hardcore, total, played, at, completed, completedHardcore, at]);
}
function match(db: DatabaseSync, gameId = 764) { run(db, setRaMatch, [JSON.stringify(catalog([19, 58])), 150, "connection", gameId, "lease"]); }
function add(db: DatabaseSync, gameId = 764, platform = 19, playing = false) {
  run(db, importRaGame, ["connection", "lease", gameId, 42, "Catalog game", null, 1992, "[]", platform, "Super Nintendo Entertainment System", 200]);
  run(db, attachRaGame, ["connection", "lease", gameId, 42, platform, 200]);
  if (playing) run(db, playRaGame, ["connection", "lease", gameId, 42, platform, 200]);
}
const tally = (db: DatabaseSync) => ({ ...db.prepare(raCounts).get("one") });
const gameRow = (db: DatabaseSync, gameId = 764) => db.prepare("SELECT id FROM ra_games WHERE game_id = ?").get(gameId)!.id as number;
function achievement(db: DatabaseSync, id: number, gameId = 764, setName: string | null = null) { run(db, saveRaAchievement, [id, gameId, setName, `Achievement ${id}`, null, null, 5, id, null, 300]); }
function earn(db: DatabaseSync, id: number, at: number, hardcore = 0) { run(db, saveRaUnlock, ["connection", "lease", gameRow(db), id, at, hardcore, 300]); }

test("adding RetroAchievements games merges with an existing copy, preserves progress, and marks playing only on request", () => {
  const db = database(); save(db); match(db);
  assert.deepEqual(tally(db), { imported: 0, ready: 1, unresolved: 0, pending: 0, achievementsPending: 0 });
  assert.equal(db.prepare(readyRaGames).all("connection").length, 1);
  db.exec("INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at, completed_at) VALUES ('one', 42, 'Existing', 19, 5, 7)");
  add(db, 764, 19, true); add(db, 764, 19, true);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 1);
  assert.deepEqual({ ...db.prepare("SELECT name, added_at, completed_at, playing_since FROM library_items").get() }, { name: "Existing", added_at: 5, completed_at: 7, playing_since: 200 });
  assert.deepEqual(tally(db), { imported: 1, ready: 0, unresolved: 0, pending: 0, achievementsPending: 1 });
  db.exec("DELETE FROM library_items");
  assert.equal(tally(db).ready, 1);
  db.close();
});

test("stale leases, other players, and games missing from the latest refresh cannot write", () => {
  const db = database();
  assert.equal(save(db, { token: "wrong" }).changes, 0);
  assert.equal(save(db).changes, 1);
  assert.equal(run(db, acquireRaLock, ["one", "second", 20000, 500]).changes, 0);
  assert.equal(run(db, acquireRaLock, ["two", "second", 20000, 50000]).changes, 0);
  match(db);
  db.exec("UPDATE ra_connections SET synced_at = 300");
  add(db);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 0);
  db.close();
});

test("a beaten game stays beaten at its earliest time, and hardcore is never lost", () => {
  const db = database();
  save(db, { completed: 5000, completedHardcore: 0 });
  save(db, { at: 200, completed: null });
  assert.deepEqual({ ...db.prepare("SELECT completed_at, completed_hardcore FROM ra_games").get() }, { completed_at: 5000, completed_hardcore: 0 });
  save(db, { at: 300, completed: 4000, completedHardcore: 1 });
  save(db, { at: 400, completed: 6000, completedHardcore: 0 });
  assert.deepEqual({ ...db.prepare("SELECT completed_at, completed_hardcore, observed_at FROM ra_games").get() }, { completed_at: 4000, completed_hardcore: 1, observed_at: 400 });
  db.close();
});

test("achievement syncs store shared definitions once, keep first unlock times, upgrade to hardcore, and list subsets", () => {
  const db = database(); save(db, { subsets: [24371], earned: 2, hardcore: 1 }); match(db); add(db);
  assert.equal(db.prepare(staleRaAchievements).all("connection").length, 1);
  achievement(db, 1); achievement(db, 2); achievement(db, 3, 24371, "Four Job Fiesta"); achievement(db, 9, 999);
  earn(db, 1, 1000); earn(db, 2, 2000); earn(db, 2, 9999, 1);
  run(db, finishRaAchievements, ["connection", "lease", gameRow(db), 3600, 300]);
  assert.deepEqual({ ...db.prepare("SELECT achievements_synced_count, play_seconds FROM ra_games").get() }, { achievements_synced_count: 3, play_seconds: 3600 });
  assert.equal(db.prepare(staleRaAchievements).all("connection").length, 0);
  assert.deepEqual(db.prepare(raAchievementListQuery).all("one", gameRow(db)).map((row) => [row.id, row.earnedAt, row.hardcore, row.setName]),
    [[2, 2000, 1, null], [1, 1000, 0, null], [3, null, 0, "Four Job Fiesta"]]);
  assert.equal(db.prepare(raAchievementListQuery).all("two", gameRow(db)).length, 0);
  run(db, finishRaAchievements, ["connection", "lease", gameRow(db), null, 300]);
  assert.equal(db.prepare("SELECT play_seconds FROM ra_games").get()!.play_seconds, 3600);
  db.close();
});

test("profiles show added games with RA's account totals", () => {
  const db = database(); save(db, { completed: 2000, completedHardcore: 1 }); match(db); add(db);
  save(db, { gameId: 5, total: 0 }); match(db, 5);
  assert.deepEqual(db.prepare(raShowcaseQuery).all("one", 12).map((row) => [row.name, row.completedAt, row.completedHardcore]), [["Catalog game", 2000, 1]]);
  db.exec("UPDATE ra_connections SET hardcore_points = 500, retro_points = 900, beaten_hardcore = 4, beaten_softcore = 1, mastered = 2");
  assert.deepEqual({ ...db.prepare(raShowcaseTotals).get("one") },
    { hardcorePoints: 500, softcorePoints: 0, retroPoints: 900, beatenHardcore: 4, beatenSoftcore: 1, mastered: 2, completed: 0, games: 1 });
  db.close();
});

test("RetroAchievements timeline reads show friends' unlocks and beaten games for added games only", () => {
  const db = database(); save(db, { completed: 2000, completedHardcore: 1 }); match(db); add(db);
  achievement(db, 1); achievement(db, 2);
  earn(db, 1, 1000); earn(db, 2, 2000, 1);
  const read = (viewer: string, floors = "{}") => db.prepare(timelineRaUnlocksQuery).all({ 1: viewer, 2: Number.MAX_SAFE_INTEGER, 3: floors, 4: 100 });
  assert.deepEqual(read("two").map((row) => [row.achievementName, row.hardcore, row.at]), [["Achievement 2", 1, 2000], ["Achievement 1", 0, 1000]]);
  assert.equal(read("two", JSON.stringify({ [`one:${gameRow(db)}`]: 500 })).length, 0);
  assert.equal(read("one").length, 0);
  assert.deepEqual(db.prepare(timelineBeatenQuery).all({ 1: "two", 2: Number.MAX_SAFE_INTEGER, 4: 16 }).map((row) => [row.at, row.hardcore]), [[2000, 1]]);
  db.exec("DELETE FROM library_items");
  assert.equal(read("two").length, 0);
  assert.equal(db.prepare(timelineBeatenQuery).all({ 1: "two", 2: Number.MAX_SAFE_INTEGER, 4: 16 }).length, 0);
  db.close();
});

test("an RA account links to one RGBoner account, and disconnect keeps library copies", () => {
  const db = database(); save(db); match(db); add(db); achievement(db, 1); earn(db, 1, 1000);
  assert.equal(run(db, linkRaConnection, ["two", "other", ulid, "Tester", 1]).changes, 0);
  db.exec("DELETE FROM ra_connections");
  assert.equal(db.prepare("SELECT count(*) AS n FROM ra_games").get()!.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM ra_unlocks").get()!.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 1);
  assert.equal(run(db, linkRaConnection, ["two", "other", ulid, "Tester", 1]).changes, 1);
  db.close();
});

test("the settings list puts the most recently played games first", () => {
  const db = database();
  for (const [gameId, played] of [[1, 100], [2, null], [3, 300]] as const) save(db, { gameId, played });
  assert.deepEqual(db.prepare(raPage("all")).all({ 1: "one", 2: "", 3: 0 }).map((row) => row.gameId), [3, 1, 2]);
  assert.deepEqual(db.prepare(raPage("all")).all({ 1: "one", 2: "game 1", 3: 0 }).map((row) => row.gameId), [1]);
  db.close();
});

test("removing the library deletes only this connection's copies and makes them ready to add again", () => {
  const db = database(); save(db); match(db); add(db);
  db.exec("INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at) VALUES ('one', 7, 'Manual', 19, 5), ('two', 42, 'Theirs', 19, 5)");
  assert.equal(run(db, removeRaCopies, ["one", "other", "lease"]).changes, 0);
  assert.equal(run(db, removeRaCopies, ["one", "connection", "stale"]).changes, 0);
  assert.equal(run(db, removeRaCopies, ["one", "connection", "lease"]).changes, 1);
  assert.deepEqual(db.prepare("SELECT user_id, name FROM library_items ORDER BY id").all().map((row) => ({ ...row })), [{ user_id: "one", name: "Manual" }, { user_id: "two", name: "Theirs" }]);
  assert.deepEqual([tally(db).ready, tally(db).imported], [1, 0]);
  db.close();
});

const unlocked = (id: number, earnedAt: number, titleRowId = 1): TimelineRaUnlock => ({ id, titleRowId, earnedAt, achievementName: `A${id}`, hardcore: false,
  person: { id: "friend", name: "Friend", href: "/users/Friend" }, igdbId: 42, name: "Game", coverUrl: null, releaseYear: null, platformName: null });

test("RetroAchievements unlocks batch per friend and game within 24 hours, and later pages skip a shown batch", () => {
  const batches = batchRaUnlocks([unlocked(1, 0), unlocked(2, BATCH_WINDOW), unlocked(3, BATCH_WINDOW * 2), unlocked(4, BATCH_WINDOW * 2, 2)]);
  assert.deepEqual(batches.map((batch) => [batch.key, batch.unlocks.map((row) => row.id)]), [["retroachievements:4", [4]], ["retroachievements:3", [3, 2]], ["retroachievements:1", [1]]]);
  const empty = { rows: [], truncated: false };
  const page = timelinePage({ games: empty, challenges: empty, favorites: empty, playing: empty, completed: empty, ratings: empty,
    retroachievements: { rows: [unlocked(3, BATCH_WINDOW * 2), unlocked(2, BATCH_WINDOW), unlocked(1, 0)], truncated: false } }, null, 1)!;
  assert.equal(page.items[0].key, "retroachievements:3");
  const cursor = parseTimelineCursor(page.next!)!;
  assert.deepEqual(cursor.retroachievements, { "friend:1": BATCH_WINDOW });
  assert.equal(parseTimelineCursor(JSON.stringify({ ...cursor, retroachievements: [] })), null);
  assert.ok(parseTimelineCursor(JSON.stringify({ ...cursor, key: "beaten:4" })));
});
