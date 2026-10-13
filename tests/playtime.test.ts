import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { playtimeOfferCount, setPlaytime, sourceMinutes, sourceNames, acceptPlaytimeOffers } from "../lib/playtime-queries.ts";
import { formatHours, hoursInput, parseHours, readPlaytime } from "../lib/playtime.ts";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) db.exec(readFileSync(new URL(name, directory), "utf8"));
  db.exec(`INSERT INTO accounts (user_id, email, display_name) VALUES ('one', 'one@example.test', 'One'), ('two', 'two@example.test', 'Two');
    INSERT INTO library_items (id, user_id, igdb_id, name, platform_id, added_at) VALUES (1, 'one', 10, 'Steam game', 6, 1), (2, 'one', 20, 'RA game', 19, 1), (3, 'one', 30, 'Manual', 130, 1), (4, 'two', 10, 'Other', 6, 1);
    INSERT INTO steam_connections (user_id, connection_id, steam_id, linked_at) VALUES ('one', 'steam-one', '1', 1), ('two', 'steam-two', '2', 1);
    INSERT INTO steam_games (connection_id, app_id, name, playtime_minutes, observed_at, library_item_id) VALUES ('steam-one', 1, 'Steam game', 600, 1, 1), ('steam-two', 1, 'Other', 50, 1, 4);
    INSERT INTO ra_connections (user_id, connection_id, ulid, username, linked_at) VALUES ('one', 'ra-one', 'U1', 'one', 1);
    INSERT INTO ra_games (connection_id, game_id, name, console_id, console_name, observed_at, play_seconds, library_item_id) VALUES ('ra-one', 5, 'RA game', 1, 'Genesis', 1, 7200, 2);`);
  return db;
}
const read = (db: DatabaseSync, id: number) => db.prepare(`SELECT play_minutes AS own, play_source_minutes AS seen, ${sourceMinutes("l")} AS minutes, ${sourceNames("l")} AS names FROM library_items l WHERE l.id = ?`).get(id) as { own: number | null; seen: number | null; minutes: number | null; names: string | null };
const offers = (db: DatabaseSync, service: "steam" | "ra") => (db.prepare(playtimeOfferCount(service)).get("one") as { total: number }).total;

test("a copy shows its own services' playtime until the player sets their own", () => {
  const db = database();
  assert.deepEqual({ ...read(db, 1) }, { own: null, seen: null, minutes: 600, names: "Steam" });
  assert.deepEqual({ ...read(db, 2) }, { own: null, seen: null, minutes: 120, names: "RetroAchievements" });
  assert.deepEqual({ ...read(db, 3) }, { own: null, seen: null, minutes: null, names: null });
  db.prepare(setPlaytime).run(1, "one", 300);
  assert.deepEqual({ ...read(db, 1) }, { own: 300, seen: 600, minutes: 600, names: "Steam" });
  db.prepare(setPlaytime).run(3, "one", 90);
  assert.deepEqual({ ...read(db, 3) }, { own: 90, seen: null, minutes: null, names: null });
  // Another player's copy is never changed.
  db.prepare(setPlaytime).run(4, "one", 5);
  assert.equal(read(db, 4).own, null);
  db.close();
});

test("only a newer service total is offered, and Use all follows the services again", () => {
  const db = database();
  db.prepare(setPlaytime).run(1, "one", 300);
  db.prepare(setPlaytime).run(2, "one", 100);
  assert.equal(offers(db, "steam"), 0);
  assert.equal(offers(db, "ra"), 0);
  db.exec("UPDATE steam_games SET playtime_minutes = 660 WHERE connection_id = 'steam-one'");
  assert.equal(offers(db, "steam"), 1);
  assert.equal(offers(db, "ra"), 0);
  db.prepare(acceptPlaytimeOffers("ra")).run("one");
  assert.equal(read(db, 1).own, 300);
  db.prepare(acceptPlaytimeOffers("steam")).run("one");
  assert.deepEqual({ ...read(db, 1) }, { own: null, seen: null, minutes: 660, names: "Steam" });
  assert.equal(read(db, 2).own, 100);
  // A total equal to the player's own time is no offer.
  db.prepare(setPlaytime).run(1, "one", 300);
  db.exec("UPDATE steam_games SET playtime_minutes = 300 WHERE connection_id = 'steam-one'");
  assert.equal(offers(db, "steam"), 0);
  db.prepare(setPlaytime).run(1, "one", null);
  assert.deepEqual({ ...read(db, 1) }, { own: null, seen: null, minutes: 300, names: "Steam" });
  db.close();
});

test("playtime reads, formats, and parses hours", () => {
  assert.deepEqual(readPlaytime(null, 90, "Steam"), { minutes: 90, own: null, source: { minutes: 90, names: "Steam" } });
  assert.deepEqual(readPlaytime(30, 90, "Steam"), { minutes: 30, own: 30, source: { minutes: 90, names: "Steam" } });
  assert.deepEqual(readPlaytime(null, null, null), { minutes: null, own: null, source: null });
  assert.equal(formatHours(90), "1.5 h");
  assert.equal(formatHours(1234 * 60), "1,234 h");
  assert.equal(parseHours(" 12.5 "), 750);
  assert.equal(parseHours(""), null);
  assert.ok(Number.isNaN(parseHours("-1")));
  assert.ok(Number.isNaN(parseHours("abc")));
  assert.ok(Number.isNaN(parseHours("200000")));
  assert.equal(hoursInput(750), "12.5");
  assert.equal(hoursInput(null), "");
});

test("manual event hours add to displayed totals without duplicating provider readings or changing either saved value", async () => {
  const { manualEventMinutes } = await import("../lib/playtime-queries.ts");
  const db = database();
  db.exec(`INSERT INTO events (id, owner_id, name, visibility, start_day, end_day, time_zone, starts_at, ends_at, created_at)
    VALUES (1, 'one', 'First', 'public', '2027-03-01', '2027-03-31', 'UTC', 1, 5000, 1), (2, 'one', 'Second', 'public', '2027-03-01', '2027-03-31', 'UTC', 1, 5000, 1);
    INSERT INTO event_games (event_id, user_id, igdb_id, platform_id, name, auto_minutes, adjust_minutes, added_at)
    VALUES (1, 'one', 10, 6, 'Steam game', 180, 0, 1), (1, 'one', 30, 130, 'Manual', 0, 120, 1),
      (2, 'one', 30, 130, 'Manual', 0, 60, 1), (1, 'two', 30, 130, 'Other player', 0, 900, 1);`);
  const added = (id: number) => (db.prepare(`SELECT ${manualEventMinutes("l")} AS minutes FROM library_items l WHERE id = ?`).get(id) as { minutes: number }).minutes;
  db.exec("UPDATE event_games SET adjust_minutes = 60 WHERE igdb_id = 10");
  assert.equal(added(1), 0, "the 180 imported event minutes are already in Steam's 600-minute total");
  assert.equal(readPlaytime(null, 600, "Steam", added(1)).minutes, 600);
  db.prepare(setPlaytime).run(3, "one", 300);
  assert.equal(added(3), 180);
  assert.equal(readPlaytime(300, null, null, added(3)).minutes, 480);
  assert.equal(read(db, 3).own, 300, "displaying event time doesn't alter library hours");
  db.exec("UPDATE event_games SET adjust_minutes = 150 WHERE event_id = 1 AND user_id = 'one' AND igdb_id = 30");
  assert.equal(readPlaytime(300, null, null, added(3)).minutes, 510);
  db.prepare(setPlaytime).run(3, "one", 360);
  assert.equal(added(3), 210, "changing library hours doesn't alter event hours");
  assert.equal(readPlaytime(360, null, null, added(3)).minutes, 570);
  assert.equal(readPlaytime(null, null, null, 90).minutes, 90);
  db.exec("UPDATE event_games SET removed = 1 WHERE event_id = 2");
  assert.equal(added(3), 150);
  db.close();
});
