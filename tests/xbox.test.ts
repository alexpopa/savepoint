import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { authorizeXbox, exchangeXboxCode, fetchAchievements, fetchMinutesPlayed, parseLegacyAchievements, parseMinutesPlayed, parseModernAchievements, parseTitleHistory, pkceChallenge, xboxLoginUrl, type XboxAuth } from "../lib/xbox-api.ts";
import { openToken, sealToken } from "../lib/token-crypto.ts";
import { defaultXboxPlatform, devicePlatformIds, xbox360MarketplaceIds, xboxPlatforms } from "../lib/xbox-types.ts";
import {
  acquireXboxLock, attachXboxGame, consumeXboxState, finishXboxAchievements, importXboxGame, linkXboxConnection, playXboxGame, readyXboxGames, removeXboxCopies, saveXboxAchievement,
  saveXboxTitle, saveXboxUnlock, setXboxMatch, staleXboxAchievements, xboxAchievementListQuery, xboxCounts, xboxPage, xboxShowcaseQuery,
} from "../lib/xbox-queries.ts";
import { timelineAchievementsQuery, timelineMasteredQuery } from "../lib/timeline-queries.ts";
import { batchAchievements, timelinePage, BATCH_WINDOW, type TimelineUnlock } from "../lib/timeline-items.ts";
import type { CatalogGame } from "../lib/game-types.ts";

const catalog = (ids: number[]): CatalogGame => ({ igdbId: 42, name: "Catalog game", coverUrl: null, releaseYear: 2020, platforms: [], platformOptions: ids.map((id) => ({ id, name: `P${id}` })) });
const auth: XboxAuth = { token: "xsts", uhs: "hash", xuid: "2533274800000000", gamertag: "Tester", expiresAt: Date.now() + 3600000 };

test("title history keeps games only, with achievement summaries, devices, product IDs, and last-played times", () => {
  const titles = parseTitleHistory({ titles: [
    { titleId: "1144039928", name: "Halo Infinite™", type: "Game", devices: ["XboxSeries", "PC"], displayImage: "http://store-images.s-microsoft.com/image.png", productId: "9NP1P1WFS0LB",
      titleHistory: { lastTimePlayed: "2026-09-01T10:00:00Z" }, achievement: { currentAchievements: 3, totalAchievements: 119, currentGamerscore: 40, totalGamerscore: 1600, sourceVersion: 2 } },
    { titleId: "1144039928", name: "Duplicate", type: "Game" },
    { titleId: "1297287142", name: "Halo 3", type: "Game", devices: ["Xbox360"], achievement: { sourceVersion: 1 } },
    { titleId: "123", name: "Netflix", type: "App" },
    { titleId: "not-a-number", name: "Broken", type: "Game" },
  ] });
  assert.deepEqual(titles.map((title) => title.titleId), [1144039928, 1297287142]);
  assert.equal(titles[0].imageUrl, "https://store-images.s-microsoft.com/image.png");
  assert.equal(titles[0].productId, "9NP1P1WFS0LB");
  assert.equal(titles[0].lastPlayedAt, Date.parse("2026-09-01T10:00:00Z"));
  assert.equal(titles[0].totalGamerscore, 1600);
  assert.equal(titles[1].achievementVersion, 1);
  assert.equal(titles[1].lastPlayedAt, null);
  assert.throws(() => parseTitleHistory({}));
});

test("modern and Xbox 360 achievement lists separate definitions from the player's unlocks", () => {
  const modern = parseModernAchievements([{ achievements: [
    { id: "1", name: "First", description: "Do it", progressState: "Achieved", progression: { timeUnlocked: "2026-09-02T00:00:00Z" },
      mediaAssets: [{ type: "Icon", url: "https://images.xboxlive.com/1.png" }], rewards: [{ type: "Gamerscore", value: "15" }], rarity: { currentPercentage: 12.34 } },
    { id: "2", name: "Secret", isSecret: true, progressState: "NotStarted", progression: { timeUnlocked: "0001-01-01T00:00:00Z" } },
  ] }, { achievements: [{ id: "1", name: "Repeated" }] }]);
  assert.deepEqual(modern.achievements.map((entry) => [entry.id, entry.gamerscore, entry.rarity, entry.isSecret]), [["1", 15, 123, false], ["2", 0, null, true]]);
  assert.deepEqual(modern.unlocks, [{ id: "1", unlockedAt: Date.parse("2026-09-02T00:00:00Z") }]);
  const legacy = parseLegacyAchievements(0x4d5307e6, { achievements: [{ id: 1, name: "Finish", gamerscore: 50, imageId: 255 }, { id: 2, name: "Other", gamerscore: 10 }] },
    { achievements: [{ id: 1, name: "Finish", unlocked: true, timeUnlocked: "2010-05-01T00:00:00Z" }] });
  assert.equal(legacy.achievements.length, 2);
  assert.equal(legacy.achievements[0].iconUrl, "https://image-ssl.xboxlive.com/global/t.4d5307e6/ach/0/ff");
  assert.deepEqual(legacy.unlocks, [{ id: "1", unlockedAt: Date.parse("2010-05-01T00:00:00Z") }]);
});

test("achievement requests follow continuations, send the Xbox Live token, and never follow redirects", async () => {
  const seen: string[] = [];
  const send: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    seen.push(url.searchParams.get("continuationToken") ?? "first");
    assert.equal(url.origin, "https://achievements.xboxlive.com");
    assert.equal(new Headers(init?.headers).get("authorization"), "XBL3.0 x=hash;xsts");
    assert.equal(init?.redirect, "manual");
    return Response.json(seen.length === 1 ? { achievements: [{ id: "1", name: "One" }], pagingInfo: { continuationToken: "next" } } : { achievements: [{ id: "2", name: "Two" }], pagingInfo: {} });
  };
  assert.deepEqual((await fetchAchievements(auth, 1, 2, send)).achievements.map((entry) => entry.id), ["1", "2"]);
  assert.deepEqual(seen, ["first", "next"]);
  await assert.rejects(fetchAchievements(auth, 1, 2, async () => new Response("", { status: 429 })), /busy/);
});

test("Microsoft sign-in uses PKCE and exchanges tokens for a verified Xbox profile", async () => {
  const url = new URL(xboxLoginUrl("client", "https://rgboner.test/api/xbox/callback", "state", await pkceChallenge("verifier")));
  assert.equal(url.origin, "https://login.microsoftonline.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ");
  assert.equal(url.searchParams.get("scope"), "XboxLive.signin offline_access");
  const send: typeof fetch = async (input, init) => {
    const target = String(input);
    if (target.endsWith("/token")) {
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("code_verifier"), "verifier");
      return Response.json({ access_token: "access", refresh_token: "refresh" });
    }
    if (target.startsWith("https://user.auth.xboxlive.com")) {
      assert.equal(JSON.parse(String(init?.body)).Properties.RpsTicket, "d=access");
      return Response.json({ Token: "user" });
    }
    return Response.json({ Token: "xsts", NotAfter: "2030-01-01T00:00:00Z", DisplayClaims: { xui: [{ uhs: "hash", xid: "2533274800000000", gtg: "Tester" }] } });
  };
  const tokens = await exchangeXboxCode("client", "secret", "https://rgboner.test/api/xbox/callback", "code", "verifier", send);
  assert.deepEqual(tokens, { accessToken: "access", refreshToken: "refresh" });
  assert.deepEqual(await authorizeXbox(tokens.accessToken, send), { token: "xsts", uhs: "hash", xuid: "2533274800000000", gamertag: "Tester", expiresAt: Date.parse("2030-01-01T00:00:00Z") });
  await assert.rejects(authorizeXbox("access", async () => Response.json({ XErr: 2148916233 }, { status: 401 })), /no Xbox profile/);
});

test("stored sign-ins are encrypted and bound to their connection", async () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const cipher = await sealToken({ refreshToken: "secret-refresh" }, key, "connection-a");
  assert.ok(!cipher.includes("secret-refresh"));
  assert.deepEqual(await openToken(cipher, key, "connection-a"), { refreshToken: "secret-refresh" });
  await assert.rejects(openToken(cipher, key, "connection-b"));
  await assert.rejects(openToken(cipher, Buffer.alloc(32, 8).toString("base64"), "connection-a"));
  await assert.rejects(sealToken({}, "c2hvcnQ=", "connection-a"), /32 bytes/);
});

test("platform defaults keep an existing copy, then prefer the platform the player used, newest console first", () => {
  assert.deepEqual(devicePlatformIds(["XboxSeries", "PC", "Mobile"]), [169, 6]);
  assert.deepEqual(xboxPlatforms(catalog([48, 49, 6])).map((p) => p.id), [49, 6]);
  assert.equal(defaultXboxPlatform(catalog([169, 49, 6]), ["PC"]), 6);
  assert.equal(defaultXboxPlatform(catalog([169, 49, 6]), ["XboxSeries"], [49]), 49);
  assert.equal(defaultXboxPlatform(catalog([49, 12]), ["XboxSeries"]), 49);
  assert.equal(defaultXboxPlatform(catalog([48])), 0);
  assert.deepEqual(xbox360MarketplaceIds(0x4d5307e6), ["66acd000-77fe-1000-9115-d8024d5307e6", "xbox36066acd000-77fe-1000-9115-d8024d5307e6"]);
});

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) db.exec(readFileSync(new URL(name, directory), "utf8"));
  db.exec(`INSERT INTO accounts (user_id, email, display_name, password_hash, email_verified_at) VALUES ('one', 'one@example.test', 'One', 'h', 1), ('two', 'two@example.test', 'Two', 'h', 1);
    INSERT INTO friendships (user_low, user_high, requester_id, status, created_at) VALUES ('one', 'two', 'one', 'accepted', 1);
    INSERT INTO xbox_connections (user_id, connection_id, xuid, gamertag, token_cipher, linked_at, synced_at, lock_token, lock_until) VALUES ('one', 'connection', '2533274800000000', 'Tester', 'sealed', 1, 100, 'lease', 10000)`);
  return db;
}
function run(db: DatabaseSync, query: string, values: (string | number | null)[]) {
  return db.prepare(query).run(Object.fromEntries(values.map((value, index) => [String(index + 1), value])));
}
function save(db: DatabaseSync, token = "lease", at = 100, current = 1) {
  return run(db, saveXboxTitle, ["connection", token, 10, "Xbox game", null, null, '["XboxSeries"]', 900, current, 2, 10, 20, 2, at, at]);
}
function match(db: DatabaseSync) { run(db, setXboxMatch, [JSON.stringify(catalog([169, 49])), 150, "connection", 10, "lease"]); }
function add(db: DatabaseSync, platform = 169, playing = false) {
  run(db, importXboxGame, ["connection", "lease", 10, 42, "Catalog game", null, 2020, "[]", platform, "Xbox Series X|S", 200]);
  run(db, attachXboxGame, ["connection", "lease", 10, 42, platform, 200]);
  if (playing) run(db, playXboxGame, ["connection", "lease", 10, 42, platform, 200]);
}
const counts = (db: DatabaseSync) => ({ ...db.prepare(xboxCounts).get("one") });

test("adding Xbox titles merges with an existing copy, preserves progress, and marks playing only on request", () => {
  const db = database(); save(db); match(db);
  assert.deepEqual(counts(db), { imported: 0, ready: 1, unresolved: 0, pending: 0, achievementsPending: 0 });
  assert.equal(db.prepare(readyXboxGames).all("connection").length, 1);
  db.exec("INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at, completed_at) VALUES ('one', 42, 'Existing', 169, 5, 7)");
  add(db, 169, true); add(db, 169, true);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 1);
  assert.deepEqual({ ...db.prepare("SELECT name, added_at, completed_at, playing_since FROM library_items").get() }, { name: "Existing", added_at: 5, completed_at: 7, playing_since: 200 });
  assert.deepEqual(counts(db), { imported: 1, ready: 0, unresolved: 0, pending: 0, achievementsPending: 1 });
  db.exec("DELETE FROM library_items");
  assert.equal(db.prepare("SELECT library_item_id FROM xbox_titles").get()!.library_item_id, null);
  // Xbox adds nothing on its own, so a removed copy is simply ready again for Add or Add all.
  assert.equal(counts(db).ready, 1);
  db.close();
});

test("stale leases, other players, and titles missing from the latest refresh cannot write", () => {
  const db = database();
  assert.equal(save(db, "wrong").changes, 0);
  assert.equal(save(db, "lease", 100).changes, 1);
  assert.equal(run(db, acquireXboxLock, ["one", "second", 20000, 500]).changes, 0);
  assert.equal(run(db, acquireXboxLock, ["two", "second", 20000, 50000]).changes, 0);
  match(db);
  db.exec("UPDATE xbox_connections SET synced_at = 300");
  add(db);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 0);
  db.close();
});

test("achievement syncs store shared definitions once, keep first unlock times, and mark completion", () => {
  const db = database(); save(db, "lease", 100, 2); match(db); add(db);
  const titleRow = db.prepare("SELECT id FROM xbox_titles").get()!.id as number;
  assert.equal(db.prepare(staleXboxAchievements).all("connection").length, 1);
  for (const [id, order] of [["a", 0], ["b", 1]] as const) run(db, saveXboxAchievement, [10, id, `Achievement ${id}`, null, null, 10, 0, 500, order, 300]);
  run(db, saveXboxUnlock, ["connection", "lease", titleRow, "a", 1000, 300]);
  run(db, saveXboxUnlock, ["connection", "lease", titleRow, "b", 2000, 300]);
  run(db, saveXboxUnlock, ["connection", "lease", titleRow, "b", 9999, 300]);
  run(db, finishXboxAchievements, ["connection", "lease", titleRow, 2, 300]);
  assert.deepEqual({ ...db.prepare("SELECT achievements_synced_count, completed_at FROM xbox_titles").get() }, { achievements_synced_count: 2, completed_at: 2000 });
  assert.equal(db.prepare(staleXboxAchievements).all("connection").length, 0);
  assert.deepEqual(db.prepare(xboxAchievementListQuery).all("one", titleRow).map((row) => [row.id, row.unlockedAt]), [["b", 2000], ["a", 1000]]);
  assert.equal(db.prepare(xboxAchievementListQuery).all("two", titleRow).length, 0);
  assert.equal(db.prepare(xboxShowcaseQuery).all("one", 12)[0].completedAt, 2000);
  // A later add-on with new achievements reopens the game until they are earned too.
  db.exec("UPDATE xbox_titles SET total_achievements = 3");
  assert.equal(db.prepare(xboxShowcaseQuery).all("one", 12)[0].completedAt, null);
  db.close();
});

test("Xbox timeline reads show friends' unlocks and completions for added games only", () => {
  const db = database(); save(db, "lease", 100, 2); match(db); add(db);
  const titleRow = db.prepare("SELECT id FROM xbox_titles").get()!.id as number;
  run(db, saveXboxAchievement, [10, "a", "Named", null, null, 10, 0, null, 0, 300]);
  run(db, saveXboxUnlock, ["connection", "lease", titleRow, "a", 1000, 300]);
  run(db, saveXboxUnlock, ["connection", "lease", titleRow, "b", 2000, 300]);
  run(db, finishXboxAchievements, ["connection", "lease", titleRow, 2, 300]);
  const unlocks = db.prepare(timelineAchievementsQuery).all({ 1: "two", 2: Number.MAX_SAFE_INTEGER, 3: "{}", 4: 100 });
  assert.deepEqual(unlocks.map((row) => [row.achievementName, row.at, row.name]), [["Achievement", 2000, "Catalog game"], ["Named", 1000, "Catalog game"]]);
  assert.equal(db.prepare(timelineAchievementsQuery).all({ 1: "two", 2: Number.MAX_SAFE_INTEGER, 3: JSON.stringify({ [`one:${titleRow}`]: 500 }), 4: 100 }).length, 0);
  assert.equal(db.prepare(timelineAchievementsQuery).all({ 1: "one", 2: Number.MAX_SAFE_INTEGER, 3: "{}", 4: 100 }).length, 0);
  assert.deepEqual(db.prepare(timelineMasteredQuery).all({ 1: "two", 2: Number.MAX_SAFE_INTEGER, 4: 16 }).map((row) => row.at), [2000]);
  db.exec("DELETE FROM library_items");
  assert.equal(db.prepare(timelineAchievementsQuery).all({ 1: "two", 2: Number.MAX_SAFE_INTEGER, 3: "{}", 4: 100 }).length, 0);
  assert.equal(db.prepare(timelineMasteredQuery).all({ 1: "two", 2: Number.MAX_SAFE_INTEGER, 4: 16 }).length, 0);
  db.close();
});

test("link states are single use, expire, and disconnect removes Xbox data but keeps library copies", () => {
  const db = database(); save(db); match(db); add(db);
  const titleRow = db.prepare("SELECT id FROM xbox_titles").get()!.id as number;
  run(db, saveXboxUnlock, ["connection", "lease", titleRow, "a", 1000, 300]);
  db.exec("DELETE FROM xbox_connections");
  assert.equal(db.prepare("SELECT count(*) AS n FROM xbox_titles").get()!.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM xbox_unlocks").get()!.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 1);
  db.exec("INSERT INTO xbox_link_states VALUES ('one', 'hash', 'verifier', 500)");
  const link = (hash: string, at: number, xuid = "2533274800000001") => run(db, linkXboxConnection, ["one", hash, at, `new-${at}`, xuid, "Tester", "sealed"]);
  assert.equal(link("other", 100).changes, 0);
  assert.equal(link("hash", 600).changes, 0);
  assert.equal(link("hash", 100).changes, 1);
  run(db, consumeXboxState, ["one", "hash"]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM xbox_link_states").get()!.n, 0);
  db.exec("INSERT INTO xbox_link_states VALUES ('two', 'hash', 'verifier', 500)");
  assert.equal(run(db, linkXboxConnection, ["two", "hash", 100, "taken", "2533274800000001", "Tester", "sealed"]).changes, 0);
  db.close();
});

test("the settings list puts the most recently played games first", () => {
  const db = database();
  for (const [titleId, played] of [[1, 100], [2, null], [3, 300]] as const) run(db, saveXboxTitle, ["connection", "lease", titleId, `Game ${titleId}`, null, null, "[]", played, 0, 0, 0, 0, 2, 100, 100]);
  assert.deepEqual(db.prepare(xboxPage("all")).all({ 1: "one", 2: "", 3: 0 }).map((row) => row.titleId), [3, 1, 2]);
  assert.deepEqual(db.prepare(xboxPage("all")).all({ 1: "one", 2: "game 1", 3: 0 }).map((row) => row.titleId), [1]);
  db.close();
});

const unlock = (id: number, unlockedAt: number, titleRowId = 1): TimelineUnlock => ({ id, titleRowId, unlockedAt, achievementName: `A${id}`, iconUrl: null, gamerscore: 10,
  person: { id: "friend", name: "Friend", href: "/users/Friend" }, igdbId: 42, name: "Game", coverUrl: null, releaseYear: null, platformName: null });

test("unlocks batch per friend and game within 24 hours, and later pages skip a shown batch", () => {
  const batches = batchAchievements([unlock(1, 0), unlock(2, BATCH_WINDOW), unlock(3, BATCH_WINDOW * 2), unlock(4, BATCH_WINDOW * 2, 2)]);
  assert.deepEqual(batches.map((batch) => [batch.key, batch.unlocks.map((row) => row.id)]), [["achievements:4", [4]], ["achievements:3", [3, 2]], ["achievements:1", [1]]]);
  const empty = { rows: [], truncated: false };
  const page = timelinePage({ games: empty, challenges: empty, favorites: empty, playing: empty, completed: empty, ratings: empty,
    achievements: { rows: [unlock(3, BATCH_WINDOW * 2), unlock(2, BATCH_WINDOW), unlock(1, 0)], truncated: false } }, null, 1)!;
  assert.equal(page.items[0].key, "achievements:3");
  assert.deepEqual(JSON.parse(page.next!).achievements, { "friend:1": BATCH_WINDOW });
});

test("removing the library deletes only this connection's copies, keeps ratings, and makes them ready to add again", () => {
  const db = database(); save(db); match(db); add(db);
  db.exec("INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at) VALUES ('one', 7, 'Manual', 6, 5), ('two', 42, 'Theirs', 169, 5)");
  assert.equal(run(db, removeXboxCopies, ["one", "other", "lease"]).changes, 0);
  assert.equal(run(db, removeXboxCopies, ["one", "connection", "stale"]).changes, 0);
  assert.equal(run(db, removeXboxCopies, ["one", "connection", "lease"]).changes, 1);
  assert.deepEqual(db.prepare("SELECT user_id, name FROM library_items ORDER BY id").all().map((row) => ({ ...row })), [{ user_id: "one", name: "Manual" }, { user_id: "two", name: "Theirs" }]);
  assert.equal(counts(db).ready, 1);
  assert.equal(counts(db).imported, 0);
  db.close();
});

test("minutes played come from the user stats batch, 25 titles per request, skipping missing or invalid stats", async () => {
  const payload = { statlistscollection: [{ arrangebyfield: "xuid", stats: [
    { xuid: "2533", titleid: "1144039928", name: "MinutesPlayed", type: "Integer", value: "4321" },
    { xuid: "2533", titleid: "219630713", name: "MinutesPlayed", type: "Integer" },
    { xuid: "2533", titleid: "bad", name: "MinutesPlayed", value: "5" },
    { xuid: "2533", titleid: "1915865634", name: "OtherStat", value: "9" },
  ] }] };
  assert.deepEqual([...parseMinutesPlayed(payload)], [[1144039928, 4321]]);
  assert.deepEqual([...parseMinutesPlayed(null)], []);
  const requests: { url: string; body: { xuids: string[]; stats: { titleid: string }[] }; version: string | null }[] = [];
  const auth = { token: "t", uhs: "u", xuid: "2533", gamertag: "Tester", expiresAt: Date.now() + 3600000 };
  const minutes = await fetchMinutesPlayed(auth, Array.from({ length: 30 }, (_, index) => index + 1), async (url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ url: String(url), body, version: new Headers(init?.headers).get("x-xbl-contract-version") });
    return Response.json({ statlistscollection: [{ stats: body.stats.map((stat: { titleid: string }) => ({ titleid: stat.titleid, name: "MinutesPlayed", value: String(Number(stat.titleid) * 10) })) }] });
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://userstats.xboxlive.com/batch");
  assert.deepEqual(requests[0].body.xuids, ["2533"]);
  assert.equal(requests[0].body.stats.length, 25);
  assert.equal(requests[0].version, "2");
  assert.equal(minutes.size, 30);
  assert.equal(minutes.get(30), 300);
});
