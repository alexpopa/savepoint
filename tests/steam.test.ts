import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { parseSteamGames, steamRequest } from "../lib/steam-api.ts";
import { steamAssertion, steamAssertionFailure, steamLoginUrl, verifySteamAssertion } from "../lib/steam-openid.ts";
import { defaultSteamPlatform, steamPlatforms } from "../lib/steam-types.ts";
import type { CatalogGame } from "../lib/game-types.ts";
import { recentSteamCount, recentSteamGames, readySteamGames, steamMatchCounts, setSteamMatch, acquireSteamLock, attachSteamGame, consumeSteamState, importSteamGame, linkSteamConnection, saveSteamGame } from "../lib/steam-queries.ts";

const returnTo = "https://rgboner.test/api/steam/callback?state=abc";
function assertion() {
  return new URLSearchParams({ "openid.ns": "http://specs.openid.net/auth/2.0", "openid.mode": "id_res",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login", "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000000",
    "openid.identity": "https://steamcommunity.com/openid/id/76561198000000000", "openid.return_to": returnTo,
    "openid.signed": "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle", "openid.sig": "signature",
    "openid.assoc_handle": "handle", "openid.response_nonce": new Date().toISOString().replace(/\.\d{3}Z$/, "Z") + "unique" });
}

test("Steam parsing distinguishes hidden data, empty libraries, zero playtime, and unknown playtime", () => {
  assert.deepEqual(parseSteamGames({ response: { game_count: 0 } }, true), []);
  assert.deepEqual(parseSteamGames({ response: { total_count: 0 } }, false), []);
  assert.throws(() => parseSteamGames({ response: {} }, true));
  assert.throws(() => parseSteamGames({ response: { game_count: 2, games: [{ appid: 1 }] } }, true));
  assert.throws(() => parseSteamGames({ response: { game_count: 2, games: [{ appid: 1 }, { appid: 1 }] } }, true));
  const games = parseSteamGames({ response: { game_count: 2, games: [{ appid: 1, playtime_forever: 0 }, { appid: 2, rtime_last_played: 100 }] } }, true);
  assert.equal(games[0].playtimeMinutes, 0);
  assert.equal(games[1].playtimeMinutes, null);
  assert.equal(games[1].lastPlayedAt, 100000);
});

test("Steam requests use the public API and include played free games without following redirects", async () => {
  const send: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.steampowered.com");
    assert.equal(init?.redirect, "manual");
    assert.deepEqual(JSON.parse(url.searchParams.get("input_json")!), { steamid: "76561198000000000", include_appinfo: true, include_played_free_games: true });
    return Response.json({ response: { game_count: 0 } });
  };
  assert.deepEqual(await steamRequest("GetOwnedGames", "76561198000000000", "fixture-key", send), []);
  await assert.rejects(steamRequest("GetOwnedGames", "76561198000000000", "key", async () => new Response("", { status: 429 })), /busy/);
});

test("OpenID rejects spoofed providers, unsigned identities, altered return URLs, duplicates, and old nonces", () => {
  assert.equal(new URL(steamLoginUrl(returnTo)).searchParams.get("openid.return_to"), returnTo);
  assert.equal(steamAssertion(assertion(), returnTo), "76561198000000000");
  for (const [field, value] of [
    ["openid.op_endpoint", "https://attacker.test"], ["openid.claimed_id", "https://attacker.test/openid/id/76561198000000000"],
    ["openid.identity", "https://steamcommunity.com/openid/id/76561198000000001"], ["openid.return_to", "https://attacker.test"],
    ["openid.signed", "op_endpoint,return_to,response_nonce,assoc_handle"], ["openid.response_nonce", "2000-01-01T00:00:00Zold"], ["openid.mode", "cancel"],
  ]) { const params = assertion(); params.set(field, value); assert.equal(steamAssertion(params, returnTo), null, field); }
  const duplicate = assertion(); duplicate.append("openid.identity", duplicate.get("openid.identity")!);
  assert.equal(steamAssertion(duplicate, returnTo), null);
  assert.equal(steamAssertionFailure(duplicate, returnTo), "duplicate_parameters");
  assert.equal(steamAssertionFailure(assertion(), "https://other.test"), "signed_return_url");
});

test("OpenID verifies the signature with the pinned provider and rejects negative or ambiguous responses", async () => {
  const send: typeof fetch = async (input, init) => {
    assert.equal(input, "https://steamcommunity.com/openid/login");
    assert.equal(init?.redirect, "manual");
    assert.equal(new URLSearchParams(String(init?.body)).get("openid.mode"), "check_authentication");
    return new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n");
  };
  assert.equal(await verifySteamAssertion(assertion(), returnTo, send), "76561198000000000");
  assert.equal(await verifySteamAssertion(assertion(), returnTo, async () => new Response(null, { status: 302, headers: { location: "https://attacker.test" } })), null);
  for (const reply of ["is_valid:false\n", "is_valid:true\nis_valid:false\n", "is_valid:true\n"]) {
    assert.equal(await verifySteamAssertion(assertion(), returnTo, async () => new Response(reply)), null);
  }
});

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) db.exec(readFileSync(new URL(name, directory), "utf8"));
  db.exec("INSERT INTO accounts (user_id, email, display_name) VALUES ('one', 'one@example.test', 'One'), ('two', 'two@example.test', 'Two')");
  db.exec("INSERT INTO steam_connections (user_id, connection_id, steam_id, linked_at, synced_at, lock_token, lock_until) VALUES ('one', 'connection', '76561198000000000', 1, 100, 'lease', 10000)");
  return db;
}
function run(db: DatabaseSync, query: string, values: (string | number | null)[]) {
  return db.prepare(query).run(Object.fromEntries(values.map((value, index) => [String(index + 1), value])));
}
function save(db: DatabaseSync, token = "lease", at = 100) { return run(db, saveSteamGame, ["connection", token, 10, "Steam game", 120, 30, 1000, at, at]); }
function importGame(db: DatabaseSync, platform = 6) {
  run(db, importSteamGame, ["connection", "lease", 10, 42, "Catalog game", null, 2000, '["PC (Microsoft Windows)"]', platform, "PC", 200]);
  run(db, attachSteamGame, ["connection", "lease", 10, 42, platform, 200]);
}

test("Steam imports merge only the same platform and preserve manual progress, metadata, and timestamps", () => {
  const db = database(); save(db);
  db.exec("INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at, playing_since, completed_at) VALUES ('one', 42, 'Existing title', 6, 5, 6, 7), ('one', 42, 'Console', 48, 8, NULL, NULL)");
  importGame(db); importGame(db);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 2);
  assert.deepEqual({ ...db.prepare("SELECT name, added_at, playing_since, completed_at FROM library_items WHERE platform_id = 6").get() }, { name: "Existing title", added_at: 5, playing_since: 6, completed_at: 7 });
  assert.equal(db.prepare("SELECT library_item_id FROM steam_games").get()!.library_item_id, 1);
  db.close();
});

test("new copies are idempotent and missing or excluded Steam games cannot be imported", () => {
  const db = database(); save(db); importGame(db); importGame(db);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 1);
  db.exec("DELETE FROM library_items");
  assert.equal(db.prepare("SELECT library_item_id FROM steam_games").get()!.library_item_id, null);
  assert.equal(db.prepare("SELECT imported_at FROM steam_games").get()!.imported_at, 200);
  db.exec("UPDATE steam_games SET ignored = 1"); importGame(db);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 0);
  db.exec("UPDATE steam_games SET ignored = 0; UPDATE steam_connections SET synced_at = 300"); importGame(db);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 0);
  db.close();
});

test("sync preserves exclusions and import links; disconnect removes source data but keeps library copies", () => {
  const db = database(); save(db); importGame(db);
  db.exec("UPDATE steam_games SET ignored = 1, game_json = '{\"igdbId\":42}'"); save(db, "lease", 400);
  assert.equal(db.prepare("SELECT ignored FROM steam_games").get()!.ignored, 1);
  assert.equal(db.prepare("SELECT library_item_id FROM steam_games").get()!.library_item_id, 1);
  db.exec("DELETE FROM steam_connections");
  assert.equal(save(db).changes, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM steam_games").get()!.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 1);
  db.close();
});

test("leases reject concurrent operations, wrong owners, and stale workers", () => {
  const db = database();
  assert.equal(run(db, acquireSteamLock, ["one", "second", 20000, 500]).changes, 0);
  assert.equal(run(db, acquireSteamLock, ["two", "second", 20000, 500]).changes, 0);
  assert.equal(save(db, "wrong").changes, 0);
  assert.equal(save(db, "lease", 11000).changes, 0);
  assert.equal(run(db, acquireSteamLock, ["one", "second", 30000, 11000]).changes, 1);
  assert.equal(save(db).changes, 0);
  assert.equal(save(db, "second").changes, 1);
  db.close();
});

test("link states are single use, expire, are bound to the player, and cannot survive disconnect", () => {
  const db = database();
  db.exec("DELETE FROM steam_connections; INSERT INTO steam_link_states VALUES ('one', 'hash', 'https://site.test/callback', 500)");
  const link = (user: string, hash: string, at: number) => run(db, linkSteamConnection, [user, hash, at, "new", "76561198000000000"]);
  assert.equal(link("two", "hash", 100).changes, 0);
  assert.equal(link("one", "wrong", 100).changes, 0);
  assert.equal(link("one", "hash", 600).changes, 0);
  assert.equal(link("one", "hash", 100).changes, 1);
  assert.equal(run(db, consumeSteamState, ["one", "hash"]).changes, 1);
  db.exec("DELETE FROM steam_connections");
  assert.equal(link("one", "hash", 100).changes, 0);
  db.exec("INSERT INTO steam_connections (user_id, connection_id, steam_id, linked_at) VALUES ('one', 'c', '76561198000000000', 1)");
  assert.throws(() => db.exec("INSERT INTO steam_connections (user_id, connection_id, steam_id, linked_at) VALUES ('two', 'another', '76561198000000000', 1)"));
  db.close();
});

test("importing never attaches another player's identical platform copy", () => {
  const db = database(); save(db);
  db.exec("INSERT INTO library_items (user_id, igdb_id, name, platform_id, added_at) VALUES ('two', 42, 'Other player', 6, 5)");
  importGame(db);
  assert.equal(db.prepare("SELECT library_item_id FROM steam_games").get()!.library_item_id, 2);
  assert.equal(db.prepare("SELECT user_id FROM library_items WHERE id = 2").get()!.user_id, "one");
  assert.equal(db.prepare("SELECT name FROM library_items WHERE id = 1").get()!.name, "Other player");
  db.close();
});


test("bulk platform choice preserves a supported existing copy before applying desktop defaults", () => {
  const game = { platformOptions: [{ id: 6, name: "Windows" }, { id: 14, name: "Mac" }, { id: 3, name: "Linux" }] } as CatalogGame;
  assert.equal(defaultSteamPlatform(game, [14, 48]), 14);
  assert.equal(defaultSteamPlatform(game, [48]), 6);
  assert.equal(defaultSteamPlatform({ ...game, platformOptions: game.platformOptions.slice(1) }), 14);
  assert.equal(defaultSteamPlatform({ ...game, platformOptions: [] }), 0);
});

test("bulk selection is bounded, owner scoped, and skips exclusions, stale observations, and removed imports", () => {
  const db = database();
  const metadata = JSON.stringify({ platformOptions: [{ id: 6, name: "Windows" }] });
  const insert = db.prepare("INSERT INTO steam_games(connection_id, app_id, name, observed_at, matched_at, game_json) VALUES('connection', ?, 'Game', 100, 100, ?)");
  for (let i = 1; i <= 65; i++) insert.run(i, metadata);
  db.exec("UPDATE steam_games SET ignored=1 WHERE app_id=1; UPDATE steam_games SET imported_at=100 WHERE app_id=2; UPDATE steam_games SET observed_at=50 WHERE app_id=3; UPDATE steam_games SET game_json=NULL WHERE app_id=4; UPDATE steam_games SET game_json=NULL,matched_at=NULL WHERE app_id=5");
  assert.deepEqual({ ...db.prepare(steamMatchCounts).get("one") }, { imported: 0, ready: 60, review: 1 });
  assert.deepEqual({ ...db.prepare(steamMatchCounts).get("two") }, { imported: 0, ready: 0, review: 0 });
  const first = db.prepare(readySteamGames).all("connection");
  assert.equal(first.length, 30);
  assert.equal(first[0].app_id, 6);
  assert.equal(db.prepare(readySteamGames).all("other-connection").length, 0);
  for (const row of first) db.prepare("UPDATE steam_games SET imported_at=200 WHERE app_id=?").run(row.app_id!);
  const next = db.prepare(readySteamGames).all("connection");
  assert.equal(next.length, 30);
  assert.equal(next[0].app_id, 36);
  db.close();
});


test("setting a match restores a legacy exclusion only for the active connection lease", () => {
  const db = database(); save(db);
  db.exec("UPDATE steam_games SET ignored = 1");
  const metadata = JSON.stringify({ igdbId: 42, platformOptions: [{ id: 6, name: "Windows" }] });
  run(db, setSteamMatch, [metadata, 200, "connection", 10, "wrong-lease"]);
  assert.equal(db.prepare("SELECT ignored FROM steam_games").get()!.ignored, 1);
  run(db, setSteamMatch, [metadata, 200, "other-connection", 10, "lease"]);
  assert.equal(db.prepare("SELECT game_json FROM steam_games").get()!.game_json, null);
  run(db, setSteamMatch, [metadata, 200, "connection", 10, "lease"]);
  assert.deepEqual({ ...db.prepare("SELECT ignored, game_json, matched_at FROM steam_games").get() }, { ignored: 0, game_json: metadata, matched_at: 200 });
  assert.equal(db.prepare(steamMatchCounts).get("one")!.ready, 1);
  db.close();
});


test("resolution and import commit together and retry without duplicates", () => {
  const db = database(); save(db);
  const metadata = JSON.stringify({ igdbId: 42, platformOptions: [{ id: 6, name: "Windows" }] });
  const resolve = () => {
    db.exec("BEGIN");
    try { run(db, setSteamMatch, [metadata, 200, "connection", 10, "lease"]); importGame(db); db.exec("COMMIT"); }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  db.exec("CREATE TRIGGER fail_attach BEFORE UPDATE OF library_item_id ON steam_games BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
  assert.throws(resolve, /fixture failure/);
  assert.equal(db.prepare("SELECT game_json FROM steam_games").get()!.game_json, null);
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 0);
  db.exec("DROP TRIGGER fail_attach");
  resolve(); resolve();
  assert.equal(db.prepare("SELECT count(*) AS n FROM library_items").get()!.n, 1);
  assert.ok(db.prepare("SELECT library_item_id FROM steam_games").get()!.library_item_id);
  db.close();
});


test("SteamVR imports retain SteamVR, while console and standalone VR platforms remain excluded", () => {
  const game = { platformOptions: [{ id: 163, name: "SteamVR" }, { id: 6, name: "Windows" }, { id: 165, name: "PlayStation VR" }, { id: 385, name: "Oculus Rift" }, { id: 384, name: "Quest" }] } as CatalogGame;
  assert.deepEqual(steamPlatforms(game).map((p) => p.id), [163, 6]);
  assert.equal(defaultSteamPlatform(game), 163);
  assert.equal(defaultSteamPlatform(game, [6]), 6);
  const db = database(); save(db);
  db.prepare("UPDATE steam_games SET game_json=?,matched_at=100").run(JSON.stringify({ platformOptions: [{ id: 163, name: "SteamVR" }] }));
  assert.equal(db.prepare(steamMatchCounts).get("one")!.ready, 1);
  assert.equal(db.prepare(readySteamGames).all("connection").length, 1);
  db.close();
});

test("recent Steam changes are owner scoped, newest first, searchable, paged, and index ordered", () => {
  const db = database();
  for (let id = 1; id <= 65; id++) {
    db.prepare("INSERT INTO library_items(id,user_id,igdb_id,name,added_at,updated_at) VALUES(?, 'one', ?, 'Game', 10, ?)").run(id, id, id === 65 ? null : id * 100);
    db.prepare("INSERT INTO steam_games(connection_id,app_id,name,observed_at,imported_at,library_item_id) VALUES('connection', ?, ?, 100, 10, ?)").run(id, `Game ${id}`, id);
  }
  const list = (user: string, offset = 0, search = "") => runRows(user, offset, search);
  function runRows(user: string, offset: number, search: string) { return db.prepare(recentSteamGames).all({1:user,2:"connection",3:search,4:offset}).map((r) => r.appId); }
  assert.equal(db.prepare(recentSteamCount).get({1:"one",2:"connection",3:""})!.total,64);
  assert.deepEqual(list("one").slice(0,3), [64,63,62]);
  assert.equal(list("one").length,30); assert.equal(list("one",30)[0],34);
  assert.deepEqual(list("two"), []); assert.deepEqual(list("one",0,"Game 61"), [61]);
  db.exec("UPDATE library_items SET updated_at=99999 WHERE id=1"); assert.equal(list("one")[0],1);
  const plan = db.prepare("EXPLAIN QUERY PLAN " + recentSteamGames).all({1:"one",2:"connection",3:"",4:0}).map((r)=>r.detail).join(" ");
  assert.match(plan,/idx_library_user_updated_at/); assert.match(plan,/idx_steam_connection_library/); assert.doesNotMatch(plan,/TEMP B-TREE/);
  db.close();
});
