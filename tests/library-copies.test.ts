import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { copyPage, copyPageSize, copyQueryParams, libraryCopiesQuery, libraryCopyPlatformsQuery, libraryGamesQuery, parseCopyFilters } from "../lib/library-copies-query.ts";

type Row = { id: number; addedAt: number; name: string; platformName?: string | null; platformNames?: string; coverUrl?: string | null };

function database() {
  const db = new DatabaseSync(":memory:");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(new URL(name, directory), "utf8"));
  }
  const insert = db.prepare("INSERT INTO library_items (id, user_id, igdb_id, name, cover_url, platform_id, platform_name, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (let i = 1; i <= 23; i++) insert.run(i, "one", i, `Game ${i}`, null, i % 2 ? 6 : 48, i % 2 ? "PC" : "PlayStation 4", i < 5 ? 100 : i * 10);
  insert.run(24, "one", 24, "100% Orange_Juice", null, 6, "PC", 5);
  insert.run(25, "one", 25, "1000 Orange Juice", null, 0, null, 5);
  insert.run(26, "two", 26, "Game 99", null, 6, "PC", 999);
  // A second copy of game 3, added later on another platform with a newer snapshot.
  insert.run(27, "one", 3, "Game 3 Remaster", "cover-3", 130, "Switch", 500);
  return db;
}
function page(db: DatabaseSync, search: string) {
  const filters = parseCopyFilters(new URLSearchParams(search));
  assert.ok(filters);
  return copyPage(db.prepare(filters.group === "game" ? libraryGamesQuery : libraryCopiesQuery).all(...copyQueryParams("one", filters)) as unknown as Row[]) as { items: Row[]; next: string | null };
}
function walk(db: DatabaseSync, search: string) {
  const seen: number[] = [];
  let cursor = "";
  do {
    const result = page(db, [search, cursor && `cursor=${cursor}`].filter(Boolean).join("&"));
    assert.ok(result.items.length <= copyPageSize);
    seen.push(...result.items.map((item) => item.id));
    cursor = result.next ?? "";
  } while (cursor);
  return seen;
}

test("pages of ten walk the owner's copies newest first without gaps or repeats, including tied timestamps", () => {
  const db = database();
  const seen = walk(db, "");
  assert.equal(seen.length, 26);
  assert.equal(new Set(seen).size, 26);
  assert.deepEqual(seen.slice(0, 3), [27, 23, 22]);
  assert.ok(!seen.includes(26));
  db.close();
});

test("search is a literal, case-insensitive substring and combines with any of several platforms", () => {
  const db = database();
  assert.deepEqual(page(db, "q=100%25").items.map((item) => item.id), [24]);
  assert.deepEqual(page(db, "q=orange_").items.map((item) => item.id), [24]);
  assert.deepEqual(page(db, "q=ORANGE").items.map((item) => item.id), [25, 24]);
  assert.deepEqual(page(db, "q=game 1&platform=48").items.map((item) => item.id), [18, 16, 14, 12, 10]);
  assert.deepEqual(page(db, "platform=0&platform=130").items.map((item) => item.id), [27, 25]);
  assert.deepEqual(page(db, "platform=0").items.map((item) => item.platformName), [null]);
  assert.deepEqual(db.prepare(libraryCopyPlatformsQuery).all("one").map((row) => row.name), ["PC", "Platform not set", "PlayStation 4", "Switch"]);
  db.close();
});

test("game pages list each game once, with its newest snapshot and every matching platform", () => {
  const db = database();
  const seen = walk(db, "group=game");
  assert.equal(seen.length, 25);
  assert.equal(new Set(seen).size, 25);
  const [first] = page(db, "group=game").items;
  assert.deepEqual([first.id, first.name, first.coverUrl, first.platformNames?.split(" · ").sort()], [3, "Game 3 Remaster", "cover-3", ["PC", "Switch"]]);
  assert.deepEqual(page(db, "group=game&platform=130").items.map((item) => [item.id, item.platformNames]), [[3, "Switch"]]);
  assert.deepEqual(page(db, "group=game&q=remaster").items.map((item) => item.id), [3]);
  db.close();
});

test("malformed filters are rejected rather than guessed", () => {
  for (const search of ["platform=-1", "platform=pc", "platform=1.5", "cursor=12", "cursor=a.b", "cursor=1.2.3", "group=copies"]) assert.equal(parseCopyFilters(new URLSearchParams(search)), null, search);
  assert.equal(parseCopyFilters(new URLSearchParams(Array.from({ length: 51 }, (_, i) => `platform=${i}`).join("&"))), null);
  assert.deepEqual(parseCopyFilters(new URLSearchParams("q=%20%20&platform=6&platform=6")), { query: null, platformIds: [6], group: "copy", cursor: null });
});
