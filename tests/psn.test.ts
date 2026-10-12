import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  durationSeconds, exchangeNpsso, fetchTitleLinks, fetchTrophies, mergePsnTitles, parsePlayedTitles, parseTrophies, parseTrophyTitles, PsnError, refreshPsnToken, type PlayedTitle, type TrophyTitle,
} from "../lib/psn-api.ts";
import { defaultPsnPlatform, formatPlaytime, psnPlatforms, sonyPlatformIds, validPsnTitleKey } from "../lib/psn-types.ts";
import {
  acquirePsnLock, adoptPsnTitles, attachPsnGame, dropAdoptedPsnTitles, finishPsnTrophies, importPsnGame, linkPsnConnection, playPsnGame, psnCounts, psnPage, psnShowcaseQuery, psnShowcaseTotals,
  psnTrophyListQuery, readyPsnGames, reconnectPsnConnection, removePsnCopies, savePsnTitle, savePsnTrophy, savePsnUnlock, setPsnMatch, stalePsnTrophies,
} from "../lib/psn-queries.ts";
import { timelinePlatinumQuery, timelineTrophiesQuery } from "../lib/timeline-queries.ts";
import { batchTrophies, parseTimelineCursor, timelinePage, BATCH_WINDOW, type TimelineTrophy } from "../lib/timeline-items.ts";
import type { CatalogGame } from "../lib/game-types.ts";

const catalog = (ids: number[]): CatalogGame => ({ igdbId: 42, name: "Catalog game", coverUrl: null, releaseYear: 2020, platforms: [], platformOptions: ids.map((id) => ({ id, name: `P${id}` })) });
const counts = (platinum: number, gold: number, silver: number, bronze: number) => ({ platinum, gold, silver, bronze });
const trophyTitle = (id: string, name: string, platforms: string[], extra: Partial<TrophyTitle> = {}): TrophyTitle => ({ npCommunicationId: id, npServiceName: platforms.includes("PS5") ? "trophy2" : "trophy",
  name, imageUrl: null, platforms, defined: counts(1, 2, 3, 4), earned: counts(0, 1, 1, 1), progress: 30, lastUpdatedAt: 500, ...extra });
const played = (titleId: string, conceptId: number | null, name: string, platform: "PS5" | "PS4", extra: Partial<PlayedTitle> = {}): PlayedTitle => ({ titleId, conceptId, name, imageUrl: null, platform,
  lastPlayedAt: 1000, playSeconds: 3600, ...extra });

test("trophy titles and played titles keep valid games only, with counts, platforms, art, and playtime", () => {
  const trophies = parseTrophyTitles([{ trophyTitles: [
    { npCommunicationId: "NPWR20188_00", npServiceName: "trophy2", trophyTitleName: "Astro’s Playroom", trophyTitleIconUrl: "http://image.api.playstation.com/a.png", trophyTitlePlatform: "PS5",
      definedTrophies: { bronze: 37, silver: 7, gold: 2, platinum: 1 }, earnedTrophies: { bronze: 10, silver: 1, gold: 0, platinum: 0 }, progress: 25, lastUpdatedDateTime: "2026-09-01T10:00:00Z" },
    { npCommunicationId: "NPWR20188_00", trophyTitleName: "Duplicate" },
    { npCommunicationId: "NPWR01234_00", trophyTitleName: "Old Game", trophyTitlePlatform: "PS3,PSVITA" },
    { npCommunicationId: "bad", trophyTitleName: "Broken" },
  ] }]);
  assert.deepEqual(trophies.map((title) => [title.npCommunicationId, title.npServiceName, title.platforms]), [["NPWR20188_00", "trophy2", ["PS5"]], ["NPWR01234_00", "trophy", ["PS3", "PSVITA"]]]);
  assert.equal(trophies[0].imageUrl, "https://image.api.playstation.com/a.png");
  assert.deepEqual(trophies[0].defined, counts(1, 2, 7, 37));
  const games = parsePlayedTitles([{ titles: [
    { titleId: "PPSA01234_00", name: "Game", localizedName: "Game™", category: "ps5_native_game", concept: { id: 10001 }, playDuration: "PT12H3M4S", lastPlayedDateTime: "2026-09-02T00:00:00Z" },
    { titleId: "CUSA01234_00", name: "Old", category: "ps4_game", playDuration: "PT0S" },
    { titleId: "CUSA09999_00", name: "App", category: "unknown" },
  ] }]);
  assert.deepEqual(games.map((title) => [title.titleId, title.platform, title.conceptId, title.playSeconds]), [["PPSA01234_00", "PS5", 10001, 43384], ["CUSA01234_00", "PS4", null, null]]);
  assert.equal(games[0].name, "Game™");
  assert.equal(durationSeconds("P1DT1H"), 90000);
  assert.equal(durationSeconds("12 hours"), null);
  assert.equal(formatPlaytime(43384), "12h played");
  assert.equal(formatPlaytime(90), "2m played");
  assert.equal(formatPlaytime(null), null);
});

test("merging joins played games to Sony-linked or same-named trophy lists and keeps the rest separate", () => {
  const trophies = [trophyTitle("NPWR00001_00", "Shared Name", ["PS5"]), trophyTitle("NPWR00002_00", "Shared Name", ["PS4"]), trophyTitle("NPWR00003_00", "Linked List", ["PS4"]), trophyTitle("NPWR00004_00", "Vita Only", ["PSVITA"])];
  const games = [
    played("PPSA00001_00", 1, "Shared Name®", "PS5"), played("CUSA00001_00", 1, "Shared Name", "PS4", { playSeconds: 1800, lastPlayedAt: 2000 }),
    played("CUSA00003_00", 3, "Different Store Name", "PS4"),
    played("PPSA00009_00", 9, "No Trophies", "PS5"),
  ];
  const rows = mergePsnTitles(trophies, games, new Map([["CUSA00003_00", ["NPWR00003_00"]]]), new Set(["CUSA00003_00"]));
  const byKey = new Map(rows.map((row) => [row.titleKey, row]));
  // A concept owned on PS5 and PS4 keeps one row per version, each with its own playtime and platform.
  assert.deepEqual([byKey.get("NPWR00001_00")!.titleIds, byKey.get("NPWR00001_00")!.platforms, byKey.get("NPWR00001_00")!.playSeconds], [["PPSA00001_00"], ["PS5"], 3600]);
  assert.deepEqual([byKey.get("NPWR00002_00")!.titleIds, byKey.get("NPWR00002_00")!.platforms, byKey.get("NPWR00002_00")!.playSeconds], [["CUSA00001_00"], ["PS4"], 1800]);
  assert.equal(byKey.get("NPWR00002_00")!.lastPlayedAt, 2000);
  assert.equal(byKey.get("NPWR00003_00")!.name, "Different Store Name");
  assert.equal(byKey.get("NPWR00004_00")!.conceptId, null);
  assert.equal(byKey.get("NPWR00004_00")!.lastPlayedAt, 500);
  const alone = byKey.get("concept:9")!;
  assert.deepEqual([alone.npCommunicationId, alone.platforms, alone.linksChecked, alone.defined.platinum], [null, ["PS5"], false, 0]);
  assert.equal(mergePsnTitles([], [played("PPSA00009_00", 9, "No Trophies", "PS5")], new Map(), new Set(["PPSA00009_00"]))[0].linksChecked, true);
  assert.equal(rows.length, 5);
  // A version without a list of its own (a PS4 copy of a PS5-only list) stays with its concept's list.
  const single = mergePsnTitles([trophyTitle("NPWR00005_00", "Solo", ["PS5"])], [played("PPSA00005_00", 5, "Solo", "PS5"), played("CUSA00005_00", 5, "Solo", "PS4")], new Map());
  assert.deepEqual([single.length, single[0].titleIds, single[0].platforms], [1, ["PPSA00005_00", "CUSA00005_00"], ["PS5", "PS4"]]);
});

test("NPSSO sign-in reads the code from Sony's redirect without following it, and expired sign-ins ask to reconnect", async () => {
  const npsso = "a".repeat(64);
  const seen: string[] = [];
  const send: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    seen.push(url.pathname);
    assert.equal(init?.redirect, "manual");
    if (url.pathname.endsWith("/authorize")) {
      assert.equal(new Headers(init?.headers).get("cookie"), `npsso=${npsso}`);
      assert.equal(url.searchParams.get("access_type"), "offline");
      return new Response(null, { status: 302, headers: { location: "com.scee.psxandroid.scecompcall://redirect/?code=v3.CODE&cid=x" } });
    }
    const form = new URLSearchParams(String(init?.body));
    assert.equal(form.get("code"), "v3.CODE");
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.match(new Headers(init?.headers).get("authorization") ?? "", /^Basic /);
    return Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 3600 });
  };
  const tokens = await exchangeNpsso(npsso, send);
  assert.deepEqual([tokens.accessToken, tokens.refreshToken], ["access", "refresh"]);
  assert.deepEqual(seen, ["/api/authz/v3/oauth/authorize", "/api/authz/v3/oauth/token"]);
  await assert.rejects(exchangeNpsso("short", send), /64-character/);
  await assert.rejects(exchangeNpsso(npsso, async () => new Response(null, { status: 302, headers: { location: "com.scee.psxandroid.scecompcall://redirect/?error=login_required" } })), /did not accept/);
  await assert.rejects(refreshPsnToken("refresh", async () => Response.json({ error: "invalid_grant" }, { status: 400 })), (error: unknown) => error instanceof PsnError && error.reconnect && error.status === 401);
});

test("title links are read five IDs at a time, and trophy lists separate definitions from earned times", async () => {
  const requests: string[] = [];
  const ids = ["CUSA00001_00", "CUSA00002_00", "CUSA00003_00", "CUSA00004_00", "CUSA00005_00", "CUSA00006_00"];
  const links = await fetchTitleLinks("access", ids, async (input, init) => {
    const url = new URL(String(input));
    requests.push(url.searchParams.get("npTitleIds")!);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer access");
    return Response.json({ titles: url.searchParams.get("npTitleIds")!.split(",").map((id) => ({ npTitleId: id, trophyTitles: id === "CUSA00006_00" ? [{ npCommunicationId: "NPWR00006_00" }] : [] })) });
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(links.get("CUSA00006_00"), ["NPWR00006_00"]);
  assert.deepEqual(links.get("CUSA00001_00"), []);
  const list = parseTrophies({ trophies: [
    { trophyId: 0, trophyType: "platinum", trophyName: "All", trophyGroupId: "default", trophyIconUrl: "https://image.api.playstation.com/0.png" },
    { trophyId: 1, trophyType: "bronze", trophyName: "First", trophyGroupId: "default" },
    { trophyId: 2, trophyType: "gold", trophyHidden: true, trophyGroupId: "001" },
    { trophyId: 3, trophyType: "unknown", trophyName: "Broken" },
  ] }, { trophies: [{ trophyId: 1, earned: true, earnedDateTime: "2026-09-01T00:00:00Z", trophyEarnedRate: "45.6" }, { trophyId: 0, earned: false, trophyEarnedRate: "1.2" }] });
  assert.deepEqual(list.trophies.map((entry) => [entry.id, entry.grade, entry.groupId, entry.isHidden, entry.rarity]), [[0, "platinum", "default", false, 12], [1, "bronze", "default", false, 456], [2, "gold", "001", true, null]]);
  assert.deepEqual(list.earned, [{ id: 1, earnedAt: Date.parse("2026-09-01T00:00:00Z") }]);
  const services: string[] = [];
  await fetchTrophies("access", "NPWR00001_00", "trophy", async (input) => { services.push(new URL(String(input)).searchParams.get("npServiceName")!); return Response.json({ trophies: [] }); });
  assert.deepEqual(services, ["trophy", "trophy"]);
  await assert.rejects(fetchTrophies("access", "NPWR00001_00", "trophy2", async () => new Response("", { status: 401 })), (error: unknown) => error instanceof PsnError && error.reconnect);
});

test("platform defaults keep an existing copy, then prefer the platform the player used, newest console first", () => {
  assert.deepEqual(sonyPlatformIds(["PS5", "PSVITA", "PSPC"]), [167, 46]);
  assert.deepEqual(psnPlatforms(catalog([48, 49, 6, 9])).map((p) => p.id), [48, 9]);
  assert.equal(defaultPsnPlatform(catalog([167, 48]), ["PS4"]), 48);
  // A PS4 version never links to an existing PS5 copy; an existing copy only wins among played platforms.
  assert.equal(defaultPsnPlatform(catalog([167, 48]), ["PS4"], [167]), 48);
  assert.equal(defaultPsnPlatform(catalog([167, 48]), ["PS5", "PS4"], [48]), 48);
  assert.equal(defaultPsnPlatform(catalog([167, 48]), ["PS3"], [48]), 48);
  assert.equal(defaultPsnPlatform(catalog([48, 9]), ["PS5"]), 48);
  assert.equal(defaultPsnPlatform(catalog([49])), 0);
  assert.ok(validPsnTitleKey("NPWR20188_00") && validPsnTitleKey("concept:10001") && validPsnTitleKey("title:CUSA00001_00"));
  assert.ok(!validPsnTitleKey("concept:") && !validPsnTitleKey("NPWR1_00") && !validPsnTitleKey(7));
});

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) db.exec(readFileSync(new URL(name, directory), "utf8"));
  db.exec(`INSERT INTO accounts (user_id, email, display_name, password_hash, email_verified_at) VALUES ('one', 'one@example.test', 'One', 'h', 1), ('two', 'two@example.test', 'Two', 'h', 1);
    INSERT INTO friendships (user_low, user_high, requester_id, status, created_at) VALUES ('one', 'two', 'one', 'accepted', 1);
    INSERT INTO psn_connections (user_id, connection_id, account_id, online_id, token_cipher, linked_at, synced_at, lock_token, lock_until) VALUES ('one', 'connection', '1234', 'Tester', 'sealed', 1, 100, 'lease', 10000)`);
  return db;
}
function run(db: DatabaseSync, query: string, values: (string | number | null)[]) {
  return db.prepare(query).run(Object.fromEntries(values.map((value, index) => [String(index + 1), value])));
}
type Save = { key?: string; np?: string | null; concept?: number | null; earned?: number; platinum?: number; token?: string; at?: number; played?: number | null; linksChecked?: number };
function save(db: DatabaseSync, { key = "NPWR00001_00", np = key.startsWith("NPWR") ? key : null, concept = 1, earned = 2, platinum = 1, token = "lease", at = 100, played = 900, linksChecked = 1 }: Save = {}) {
  return run(db, savePsnTitle, ["connection", token, key, `Game ${key}`, null, '["PS5"]', np, np ? "trophy2" : null, concept, '["PPSA00001_00"]', linksChecked, played, 7200,
    0, 0, 0, earned, platinum, 0, 0, np ? 3 : 0, 40, at, at]);
}
function match(db: DatabaseSync, key = "NPWR00001_00") { run(db, setPsnMatch, [JSON.stringify(catalog([167, 48])), 150, "connection", key, "lease"]); }
function add(db: DatabaseSync, key = "NPWR00001_00", platform = 167, playing = false) {
  run(db, importPsnGame, ["connection", "lease", key, 42, "Catalog game", null, 2020, "[]", platform, "PlayStation 5", 200]);
  run(db, attachPsnGame, ["connection", "lease", key, 42, platform, 200]);
  if (playing) run(db, playPsnGame, ["connection", "lease", key, 42, platform, 200]);
}
const tally = (db: DatabaseSync) => ({ ...db.prepare(psnCounts).get("one") });
const titleRow = (db: DatabaseSync, key = "NPWR00001_00") => db.prepare("SELECT id FROM psn_titles WHERE title_key = ?").get(key)!.id as number;
function trophy(db: DatabaseSync, id: number, grade: string, group = "default") { run(db, savePsnTrophy, ["NPWR00001_00", id, group, `Trophy ${id}`, null, null, grade, 0, null, 300]); }
function earn(db: DatabaseSync, id: number, at: number) { run(db, savePsnUnlock, ["connection", "lease", titleRow(db), id, at, 300]); }

test("adding PlayStation titles merges with an existing copy, preserves progress, and marks playing only on request", () => {
  const db = database(); save(db); match(db);
  assert.deepEqual(tally(db), { imported: 0, ready: 1, unresolved: 0, pending: 0, trophiesPending: 0 });
  assert.equal(db.prepare(readyPsnGames).all("connection").length, 1);
  db.exec("INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at, completed_at) VALUES ('one', 42, 'Existing', 167, 5, 7)");
  add(db, "NPWR00001_00", 167, true); add(db, "NPWR00001_00", 167, true);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 1);
  assert.deepEqual({ ...db.prepare("SELECT name, added_at, completed_at, playing_since FROM library_items").get() }, { name: "Existing", added_at: 5, completed_at: 7, playing_since: 200 });
  assert.deepEqual(tally(db), { imported: 1, ready: 0, unresolved: 0, pending: 0, trophiesPending: 1 });
  db.exec("DELETE FROM library_items");
  assert.equal(tally(db).ready, 1);
  db.close();
});

test("stale leases, other players, and titles missing from the latest refresh cannot write", () => {
  const db = database();
  assert.equal(save(db, { token: "wrong" }).changes, 0);
  assert.equal(save(db).changes, 1);
  assert.equal(run(db, acquirePsnLock, ["one", "second", 20000, 500]).changes, 0);
  assert.equal(run(db, acquirePsnLock, ["two", "second", 20000, 50000]).changes, 0);
  match(db);
  db.exec("UPDATE psn_connections SET synced_at = 300");
  add(db);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 0);
  db.close();
});

test("a played-only game later linked to its trophy list keeps its match and library copy", () => {
  const db = database();
  save(db, { key: "concept:1", np: null, linksChecked: 0 }); match(db, "concept:1"); add(db, "concept:1");
  db.exec("UPDATE psn_connections SET synced_at = 300");
  save(db, { at: 300 });
  run(db, adoptPsnTitles, ["connection", "lease", 300]);
  run(db, dropAdoptedPsnTitles, ["connection", "lease", 300]);
  const rows = db.prepare("SELECT title_key, library_item_id IS NOT NULL AS added, matched_at FROM psn_titles").all().map((row) => ({ ...row }));
  assert.deepEqual(rows, [{ title_key: "NPWR00001_00", added: 1, matched_at: 150 }]);
  assert.equal(tally(db).imported, 1);
  db.close();
});

test("an earlier played-only copy moves only to the trophy row on its platform", () => {
  const db = database();
  run(db, savePsnTitle, ["connection", "lease", "concept:1", "Game", null, '["PS4","PS5"]', null, null, 1, '["CUSA00001_00","PPSA00001_00"]', 0, 900, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100]);
  match(db, "concept:1"); run(db, importPsnGame, ["connection", "lease", "concept:1", 42, "Catalog game", null, 2020, "[]", 48, "PlayStation 4", 200]);
  run(db, attachPsnGame, ["connection", "lease", "concept:1", 42, 48, 200]);
  db.exec("UPDATE psn_connections SET synced_at = 300");
  for (const [key, platform, id] of [["NPWR00001_00", "PS5", "PPSA00001_00"], ["NPWR00002_00", "PS4", "CUSA00001_00"]])
    run(db, savePsnTitle, ["connection", "lease", key, "Game", null, `["${platform}"]`, key, "trophy", 1, `["${id}"]`, 1, 900, 60, 0, 0, 0, 1, 1, 0, 0, 1, 0, 300, 300]);
  run(db, adoptPsnTitles, ["connection", "lease", 300]);
  run(db, dropAdoptedPsnTitles, ["connection", "lease", 300]);
  assert.deepEqual(db.prepare("SELECT title_key, library_item_id IS NOT NULL AS added, matched_at FROM psn_titles ORDER BY title_key").all().map((row) => ({ ...row })),
    [{ title_key: "NPWR00001_00", added: 0, matched_at: 150 }, { title_key: "NPWR00002_00", added: 1, matched_at: 150 }]);
  db.close();
});

test("trophy syncs store shared definitions once, keep first earned times, and complete on the platinum", () => {
  const db = database(); save(db, { earned: 2, platinum: 1 }); match(db); add(db);
  assert.equal(db.prepare(stalePsnTrophies).all("connection").length, 1);
  trophy(db, 0, "platinum"); trophy(db, 1, "bronze"); trophy(db, 2, "gold", "001");
  earn(db, 1, 1000); earn(db, 0, 2000); earn(db, 0, 9999);
  run(db, finishPsnTrophies, ["connection", "lease", titleRow(db), 300]);
  assert.deepEqual({ ...db.prepare("SELECT trophies_synced_count, completed_at FROM psn_titles").get() }, { trophies_synced_count: 2, completed_at: 2000 });
  assert.equal(db.prepare(stalePsnTrophies).all("connection").length, 0);
  assert.deepEqual(db.prepare(psnTrophyListQuery).all("one", titleRow(db)).map((row) => [row.id, row.earnedAt]), [[0, 2000], [1, 1000], [2, null]]);
  assert.equal(db.prepare(psnTrophyListQuery).all("two", titleRow(db)).length, 0);
  assert.equal(db.prepare(psnShowcaseQuery).all("one", 12)[0].completedAt, 2000);
  db.exec("UPDATE psn_connections SET trophy_level = 312, earned_platinum = 4");
  assert.deepEqual({ ...db.prepare(psnShowcaseTotals).get("one") }, { level: 312, platinum: 4, gold: 0, silver: 0, bronze: 0, games: 1, completed: 1 });
  db.close();
});

test("lists without a platinum complete with every base-game trophy, ignoring add-ons", () => {
  const db = database(); save(db, { earned: 2, platinum: 0 }); match(db); add(db);
  trophy(db, 1, "bronze"); trophy(db, 2, "silver"); trophy(db, 3, "gold", "001");
  earn(db, 1, 1000);
  run(db, finishPsnTrophies, ["connection", "lease", titleRow(db), 300]);
  assert.equal(db.prepare("SELECT completed_at FROM psn_titles").get()!.completed_at, null);
  earn(db, 2, 3000);
  run(db, finishPsnTrophies, ["connection", "lease", titleRow(db), 300]);
  assert.equal(db.prepare("SELECT completed_at FROM psn_titles").get()!.completed_at, 3000);
  db.close();
});

test("PlayStation timeline reads show friends' trophies and completions for added games only", () => {
  const db = database(); save(db); match(db); add(db);
  trophy(db, 0, "platinum"); trophy(db, 1, "bronze");
  earn(db, 1, 1000); earn(db, 0, 2000);
  run(db, finishPsnTrophies, ["connection", "lease", titleRow(db), 300]);
  const read = (viewer: string, floors = "{}") => db.prepare(timelineTrophiesQuery).all({ 1: viewer, 2: Number.MAX_SAFE_INTEGER, 3: floors, 4: 100 });
  assert.deepEqual(read("two").map((row) => [row.trophyName, row.grade, row.at]), [["Trophy 0", "platinum", 2000], ["Trophy 1", "bronze", 1000]]);
  assert.equal(read("two", JSON.stringify({ [`one:${titleRow(db)}`]: 500 })).length, 0);
  assert.equal(read("one").length, 0);
  assert.deepEqual(db.prepare(timelinePlatinumQuery).all({ 1: "two", 2: Number.MAX_SAFE_INTEGER, 4: 16 }).map((row) => [row.at, row.hasPlatinum]), [[2000, 1]]);
  db.exec("DELETE FROM library_items");
  assert.equal(read("two").length, 0);
  assert.equal(db.prepare(timelinePlatinumQuery).all({ 1: "two", 2: Number.MAX_SAFE_INTEGER, 4: 16 }).length, 0);
  db.close();
});

test("a PSN account links to one RGBoner account, reconnects in place, and disconnect keeps library copies", () => {
  const db = database(); save(db); match(db); add(db); earn(db, 1, 1000);
  assert.equal(run(db, linkPsnConnection, ["two", "other", "1234", "Tester", "sealed", 1]).changes, 0);
  db.exec("UPDATE psn_connections SET needs_reconnect = 1, sync_error = 'expired'");
  assert.equal(run(db, reconnectPsnConnection, ["one", "9999", "Tester", "new"]).changes, 0);
  assert.equal(run(db, reconnectPsnConnection, ["one", "1234", "Renamed", "new"]).changes, 1);
  assert.deepEqual({ ...db.prepare("SELECT connection_id, online_id, token_cipher, needs_reconnect, sync_error FROM psn_connections").get() },
    { connection_id: "connection", online_id: "Renamed", token_cipher: "new", needs_reconnect: 0, sync_error: null });
  assert.equal(db.prepare("SELECT count(*) AS n FROM psn_titles").get()!.n, 1);
  db.exec("DELETE FROM psn_connections");
  assert.equal(db.prepare("SELECT count(*) AS n FROM psn_titles").get()!.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM psn_unlocks").get()!.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 1);
  assert.equal(run(db, linkPsnConnection, ["two", "other", "1234", "Tester", "sealed", 1]).changes, 1);
  db.close();
});

test("the settings list puts the most recently played games first", () => {
  const db = database();
  for (const [key, played] of [["NPWR00001_00", 100], ["NPWR00002_00", null], ["NPWR00003_00", 300]] as const) save(db, { key, played });
  assert.deepEqual(db.prepare(psnPage("all")).all({ 1: "one", 2: "", 3: 0 }).map((row) => row.titleKey), ["NPWR00003_00", "NPWR00001_00", "NPWR00002_00"]);
  assert.deepEqual(db.prepare(psnPage("all")).all({ 1: "one", 2: "npwr00001", 3: 0 }).map((row) => row.titleKey), ["NPWR00001_00"]);
  db.close();
});

test("removing the library deletes only this connection's copies, keeps ratings, and makes them ready to add again", () => {
  const db = database(); save(db); match(db); add(db);
  db.exec("INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at) VALUES ('one', 7, 'Manual', 48, 5), ('two', 42, 'Theirs', 167, 5)");
  assert.equal(run(db, removePsnCopies, ["one", "other", "lease"]).changes, 0);
  assert.equal(run(db, removePsnCopies, ["one", "connection", "stale"]).changes, 0);
  assert.equal(run(db, removePsnCopies, ["one", "connection", "lease"]).changes, 1);
  assert.deepEqual(db.prepare("SELECT user_id, name FROM library_items ORDER BY id").all().map((row) => ({ ...row })), [{ user_id: "one", name: "Manual" }, { user_id: "two", name: "Theirs" }]);
  assert.deepEqual([tally(db).ready, tally(db).imported], [1, 0]);
  db.close();
});

const earned = (id: number, earnedAt: number, titleRowId = 1): TimelineTrophy => ({ id, titleRowId, earnedAt, trophyName: `T${id}`, grade: "bronze",
  person: { id: "friend", name: "Friend", href: "/users/Friend" }, igdbId: 42, name: "Game", coverUrl: null, releaseYear: null, platformName: null });

test("trophies batch per friend and game within 24 hours, and later pages skip a shown batch", () => {
  const batches = batchTrophies([earned(1, 0), earned(2, BATCH_WINDOW), earned(3, BATCH_WINDOW * 2), earned(4, BATCH_WINDOW * 2, 2)]);
  assert.deepEqual(batches.map((batch) => [batch.key, batch.trophies.map((row) => row.id)]), [["trophies:4", [4]], ["trophies:3", [3, 2]], ["trophies:1", [1]]]);
  const empty = { rows: [], truncated: false };
  const page = timelinePage({ games: empty, challenges: empty, favorites: empty, playing: empty, completed: empty, ratings: empty,
    trophies: { rows: [earned(3, BATCH_WINDOW * 2), earned(2, BATCH_WINDOW), earned(1, 0)], truncated: false } }, null, 1)!;
  assert.equal(page.items[0].key, "trophies:3");
  const cursor = parseTimelineCursor(page.next!)!;
  assert.deepEqual(cursor.trophies, { "friend:1": BATCH_WINDOW });
  assert.equal(parseTimelineCursor(JSON.stringify({ ...cursor, trophies: [] })), null);
});
