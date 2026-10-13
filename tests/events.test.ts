import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  acceptEventInvite, addEventGame, copyEvent, copyEventMultipliers, eventAchievements, eventCompletions, eventPlaytimeSources, inviteToEvent, joinEvent,
  saveEventBaseline, saveEventGame, visibleEventsQuery,
} from "../lib/event-queries.ts";
import {
  canEditPlayer, canViewEvent, dayStart, eventDays, eventStatus, eventWindow, gameResult, gameScore, isEventHost, leaderboard, minutesSince, parseEventSettings, parsePoints, pointsFor,
} from "../lib/event-rules.ts";

const player = { userId: "one", isAdmin: false };
const admin = { userId: "admin", isAdmin: true };

test("events run whole days in the owner's time zone, including across daylight saving changes", () => {
  assert.equal(dayStart("2027-01-15", "UTC"), Date.UTC(2027, 0, 15));
  assert.equal(dayStart("2027-01-15", "America/Toronto"), Date.UTC(2027, 0, 15, 5));
  assert.equal(dayStart("2027-07-15", "America/Toronto"), Date.UTC(2027, 6, 15, 4));
  assert.equal(dayStart("2027-01-15", "Asia/Tokyo"), Date.UTC(2027, 0, 14, 15));
  // Toronto springs forward on 14 March 2027: that day is 23 hours long.
  const { startsAt, endsAt } = eventWindow("2027-03-14", "2027-03-14", "America/Toronto");
  assert.equal(startsAt, Date.UTC(2027, 2, 14, 5));
  assert.equal(endsAt - startsAt, 23 * 3600000);
  const month = eventWindow("2027-03-01", "2027-03-31", "UTC");
  assert.deepEqual(month, { startsAt: Date.UTC(2027, 2, 1), endsAt: Date.UTC(2027, 3, 1) });
  assert.equal(eventStatus(month, Date.UTC(2027, 1, 28)), "upcoming");
  assert.equal(eventStatus(month, Date.UTC(2027, 2, 1)), "live");
  assert.equal(eventStatus(month, Date.UTC(2027, 3, 1)), "ended");
  assert.equal(eventDays("2027-03-01", "2027-03-31"), "Mar 1 – Mar 31, 2027");
  assert.equal(eventDays("2026-12-20", "2027-01-05"), "Dec 20, 2026 – Jan 5, 2027");
  assert.equal(eventDays("2027-03-01", "2027-03-01"), "Mar 1, 2027");
});

test("settings are checked field by field, with multipliers in tenths", () => {
  const valid = { name: " Backlog Season ", description: "", rules: "8 hours before beaten.", visibility: "public", startDay: "2027-03-01", endDay: "2027-03-31", timeZone: "America/Toronto", hourPoints: 1, beatenPoints: 2.5, completedPoints: 0 };
  const parsed = parseEventSettings(valid);
  assert.ok("settings" in parsed);
  assert.deepEqual(parsed.settings, { ...valid, name: "Backlog Season", hourPoints: 10, beatenPoints: 25, completedPoints: 0, consoles: [] });
  const withConsoles = parseEventSettings({ ...valid, consoles: [{ platformId: 8, name: "ignored", hourPoints: 2, beatenPoints: 1.5, completedPoints: 0 }] });
  assert.ok("settings" in withConsoles);
  assert.deepEqual(withConsoles.settings.consoles, [{ platformId: 8, hourPoints: 20, beatenPoints: 15, completedPoints: 0 }]);
  assert.ok("error" in parseEventSettings({ ...valid, consoles: [{ platformId: 8, hourPoints: 1, beatenPoints: 1, completedPoints: 0 }, { platformId: 8, hourPoints: 2, beatenPoints: 1, completedPoints: 0 }] }));
  assert.ok("error" in parseEventSettings({ ...valid, consoles: [{ platformId: 0, hourPoints: 1, beatenPoints: 1, completedPoints: 0 }] }));
  assert.ok("error" in parseEventSettings({ ...valid, consoles: [{ platformId: 8, hourPoints: -1, beatenPoints: 1, completedPoints: 0 }] }));
  assert.ok("error" in parseEventSettings({ ...valid, consoles: "PS2" }));
  assert.ok("error" in parseEventSettings({ ...valid, name: "" }));
  assert.ok("error" in parseEventSettings({ ...valid, visibility: "friends" }));
  assert.ok("error" in parseEventSettings({ ...valid, endDay: "2027-02-28" }));
  assert.ok("error" in parseEventSettings({ ...valid, startDay: "2027-02-30" }));
  assert.ok("error" in parseEventSettings({ ...valid, timeZone: "Mars/Olympus" }));
  assert.ok("error" in parseEventSettings({ ...valid, hourPoints: -1 }));
  assert.ok("error" in parseEventSettings({ ...valid, endDay: "2029-01-01" }));
  assert.equal(parsePoints(1.5), 15);
  assert.equal(parsePoints(0.1), 1);
  assert.equal(parsePoints(0.05), null);
  assert.equal(parsePoints(101), null);
  assert.equal(parsePoints("1"), null);
});

test("hosts and site admins manage events; private events show only to the people in them; results lock at the end", () => {
  const event = { ownerId: "owner", visibility: "private" as const };
  assert.equal(isEventHost(player, event, []), false);
  assert.equal(isEventHost(player, event, ["one"]), true);
  assert.equal(isEventHost({ userId: "owner", isAdmin: false }, event, []), true);
  assert.equal(isEventHost(admin, event, []), true);
  assert.equal(canViewEvent(null, { visibility: "public" }, false, null), false);
  assert.equal(canViewEvent(player, { visibility: "public" }, false, null), true);
  assert.equal(canViewEvent(player, event, false, null), false);
  assert.equal(canViewEvent(player, event, false, "invited"), true);
  assert.equal(canViewEvent(admin, event, false, null), true);
  assert.equal(canEditPlayer(player, "one", false, "live"), true);
  assert.equal(canEditPlayer(player, "one", false, "ended"), false);
  assert.equal(canEditPlayer(player, "two", false, "live"), false);
  assert.equal(canEditPlayer(player, "two", true, "ended"), true);
});

test("event time is what each source adds after the baseline; new games count in full and old ones not at all", () => {
  const baselineAt = 1000;
  const baseline = { "steam:1": 600, "ra:5": 30 };
  assert.equal(minutesSince(baseline, baselineAt, [{ key: "steam:1", minutes: 720, lastPlayedAt: 2000 }]), 120);
  assert.equal(minutesSince(baseline, baselineAt, [{ key: "steam:1", minutes: 500, lastPlayedAt: 2000 }]), 0);
  assert.equal(minutesSince(baseline, baselineAt, [{ key: "steam:2", minutes: 90, lastPlayedAt: 2000 }]), 90);
  assert.equal(minutesSince(baseline, baselineAt, [{ key: "steam:3", minutes: 90, lastPlayedAt: 500 }]), 0);
  assert.equal(minutesSince(baseline, baselineAt, [{ key: "steam:4", minutes: 90, lastPlayedAt: null }]), 90);
  assert.equal(minutesSince(baseline, baselineAt, [{ key: "xbox:7", minutes: null, lastPlayedAt: 2000 }]), 0);
  assert.equal(minutesSince(baseline, baselineAt, [{ key: "steam:1", minutes: 660, lastPlayedAt: 2000 }, { key: "ra:5", minutes: 90, lastPlayedAt: 2000 }]), 120);
});

test("edits sit on top of automatic values; completed counts as beaten; the most specific multiplier scores", () => {
  const auto = { autoMinutes: 120, adjustMinutes: 0, autoBeatenAt: null, autoCompletedAt: null, beaten: null, completed: null };
  assert.deepEqual(gameResult(auto), { minutes: 120, beaten: false, completed: false });
  assert.deepEqual(gameResult({ ...auto, adjustMinutes: 60 }), { minutes: 180, beaten: false, completed: false });
  assert.deepEqual(gameResult({ ...auto, adjustMinutes: -500 }), { minutes: 0, beaten: false, completed: false });
  assert.deepEqual(gameResult({ ...auto, autoBeatenAt: 5 }), { minutes: 120, beaten: true, completed: false });
  assert.deepEqual(gameResult({ ...auto, autoBeatenAt: 5, beaten: false }), { minutes: 120, beaten: false, completed: false });
  assert.deepEqual(gameResult({ ...auto, autoCompletedAt: 5 }), { minutes: 120, beaten: true, completed: true });
  assert.deepEqual(gameResult({ ...auto, completed: true, beaten: false }), { minutes: 120, beaten: true, completed: true });
  const event = { hourPoints: 10, beatenPoints: 10, completedPoints: 0 };
  // Five hours, beaten, beaten multiplier 2: 5 + 10.
  assert.equal(gameScore({ ...event, beatenPoints: 20 }, { minutes: 300, beaten: true, completed: false }), 15);
  assert.equal(gameScore({ ...event, beatenPoints: 5 }, { minutes: 300, beaten: true, completed: false }), 7.5);
  assert.equal(gameScore({ ...event, completedPoints: 10 }, { minutes: 300, beaten: true, completed: true }), 15);
  assert.equal(gameScore(event, { minutes: 90, beaten: false, completed: false }), 1.5);
  const multipliers = [{ kind: "platform" as const, targetId: 8, hourPoints: 20, beatenPoints: 20, completedPoints: 0 }, { kind: "game" as const, targetId: 99, hourPoints: 30, beatenPoints: 0, completedPoints: 0 }];
  assert.equal(pointsFor(event, multipliers, { igdbId: 1, platformId: 8 }).hourPoints, 20);
  assert.equal(pointsFor(event, multipliers, { igdbId: 99, platformId: 8 }).hourPoints, 30);
  assert.equal(pointsFor(event, multipliers, { igdbId: 1, platformId: 6 }), event);
});

test("the leaderboard ranks by score, then games beaten, and counts beaten separately from the score", () => {
  const event = { hourPoints: 10, beatenPoints: 10, completedPoints: 0 };
  const game = (userId: string, minutes: number, beaten = false, removed = false) => ({ userId, igdbId: minutes, platformId: 6, removed, autoMinutes: minutes, adjustMinutes: 0, autoBeatenAt: beaten ? 1 : null, autoCompletedAt: null, beaten: null, completed: null });
  const rows = leaderboard(event, [], [{ userId: "a", name: "Ana" }, { userId: "b", name: "Bo" }, { userId: "c", name: "Cy" }, { userId: "d", name: "Di" }],
    [game("a", 300, true), game("b", 600), game("c", 600), game("c", 600, true, true), game("x", 6000)]);
  assert.deepEqual(rows.map((row) => [row.name, row.score, row.beaten, row.rank]), [["Ana", 10, 1, 1], ["Bo", 10, 0, 2], ["Cy", 10, 0, 2], ["Di", 0, 0, 4]]);
  assert.equal(rows[0].games, 1);
  assert.equal(rows[0].minutes, 300);
});

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) db.exec(readFileSync(new URL(name, directory), "utf8"));
  db.exec(`INSERT INTO accounts (user_id, email, display_name) VALUES ('owner', 'o@example.test', 'Owner'), ('one', 'one@example.test', 'One'), ('two', 'two@example.test', 'Two');
    INSERT INTO events (id, owner_id, name, visibility, start_day, end_day, time_zone, starts_at, ends_at, created_at) VALUES
      (1, 'owner', 'Open', 'public', '2027-03-01', '2027-03-31', 'UTC', 1000, 5000, 1), (2, 'owner', 'Closed', 'private', '2027-03-01', '2027-03-31', 'UTC', 1000, 5000, 1);`);
  return db;
}
const member = (db: DatabaseSync, event: number, user: string) => db.prepare("SELECT status, joined_at AS joinedAt, baseline_at AS baselineAt FROM event_members WHERE event_id = ? AND user_id = ?").get(event, user);

test("public events take anyone until they end; private ones need an invitation; rejoining keeps the first join", () => {
  const db = database();
  assert.equal(db.prepare(joinEvent).run(1, "one", 2000, 0).changes, 1);
  assert.equal(db.prepare(joinEvent).run(2, "one", 2000, 0).changes, 0);
  assert.equal(db.prepare(joinEvent).run(2, "owner", 2000, 1).changes, 1, "hosts join their own private events");
  assert.equal(db.prepare(joinEvent).run(1, "two", 6000, 0).changes, 0);
  db.exec("UPDATE event_members SET status = 'left' WHERE user_id = 'one'");
  db.prepare(joinEvent).run(1, "one", 3000, 0);
  assert.deepEqual({ ...member(db, 1, "one") }, { status: "joined", joinedAt: 2000, baselineAt: null });
  assert.equal(db.prepare(acceptEventInvite).run(2, "two", 2000).changes, 0);
  db.prepare(inviteToEvent).run(2, "two", "owner", 1500);
  assert.equal(member(db, 2, "two")!.status, "invited");
  assert.equal(db.prepare(acceptEventInvite).run(2, "two", 6000).changes, 0, "an ended event takes no one");
  assert.equal(db.prepare(acceptEventInvite).run(2, "two", 2000).changes, 1);
  db.prepare(inviteToEvent).run(2, "two", "owner", 2500);
  assert.equal(member(db, 2, "two")!.status, "joined", "a new invitation never downgrades a player");
  db.exec("UPDATE event_members SET status = 'left' WHERE event_id = 2 AND user_id = 'two'");
  assert.equal(db.prepare(acceptEventInvite).run(2, "two", 3000).changes, 1, "a player who left can rejoin a private event");
  const visible = (user: string, isAdmin = 0) => (db.prepare(visibleEventsQuery).all(user, isAdmin) as { id: number }[]).map((row) => row.id);
  assert.deepEqual(visible("one"), [1]);
  assert.deepEqual(visible("two"), [2, 1]);
  assert.deepEqual(visible("owner"), [2, 1]);
  assert.deepEqual(visible("nobody", 1), [2, 1]);
  db.close();
});

test("the baseline is taken once, and updates never undo a player's edits or removals", () => {
  const db = database();
  db.prepare(joinEvent).run(1, "one", 2000, 0);
  assert.equal(db.prepare(saveEventBaseline).run(1, "one", 2100, "{}").changes, 1);
  assert.equal(db.prepare(saveEventBaseline).run(1, "one", 2200, "{}").changes, 0);
  assert.equal(member(db, 1, "one")!.baselineAt, 2100);
  db.exec("INSERT INTO library_items (id, user_id, igdb_id, name, platform_id, platform_name, added_at) VALUES (7, 'one', 70, 'Game', 8, 'PlayStation 2', 1), (8, 'two', 80, 'Theirs', 8, 'PlayStation 2', 1)");
  const save = (minutes: number, beatenAt: number | null) => db.prepare(saveEventGame).run(1, "one", 7, 70, 8, "PlayStation 2", "Game", null, minutes, beatenAt, null, 2, 2300);
  save(60, null);
  db.exec("UPDATE event_games SET adjust_minutes = 30, beaten = 0");
  save(120, 2500);
  assert.deepEqual({ ...db.prepare("SELECT auto_minutes, adjust_minutes, auto_beaten_at, beaten, achievements FROM event_games").get() }, { auto_minutes: 120, adjust_minutes: 30, auto_beaten_at: 2500, beaten: 0, achievements: 2 });
  db.exec("UPDATE event_games SET removed = 1");
  save(180, 2500);
  assert.equal(db.prepare("SELECT removed FROM event_games").get()!.removed, 1);
  assert.equal(db.prepare(addEventGame).run(1, "one", 7, 2400).changes, 1);
  assert.deepEqual({ ...db.prepare("SELECT removed, auto_minutes, adjust_minutes FROM event_games").get() }, { removed: 0, auto_minutes: 180, adjust_minutes: 30 });
  assert.equal(db.prepare(addEventGame).run(1, "one", 8, 2400).changes, 0, "only the player's own copies can be added");
  db.close();
});

test("completions, achievements, and playtime sources come from the player's own linked records inside the event", () => {
  const db = database();
  db.exec(`INSERT INTO library_items (id, user_id, igdb_id, name, platform_id, added_at, completed_at) VALUES (1, 'one', 10, 'Marked', 6, 1, 1500), (2, 'one', 20, 'Old', 6, 1, 500), (3, 'one', 30, 'Retro', 19, 1, NULL), (4, 'two', 10, 'Theirs', 6, 1, 1500);
    INSERT INTO ra_connections (user_id, connection_id, ulid, username, linked_at) VALUES ('one', 'ra', 'U', 'one', 1);
    INSERT INTO ra_games (id, connection_id, game_id, name, console_id, console_name, observed_at, earned, total, play_seconds, last_played_at, completed_at, library_item_id) VALUES
      (1, 'ra', 5, 'Retro', 1, 'Genesis', 1, 3, 3, 7200, 2500, 2000, 3), (2, 'ra', 6, 'Unadded', 1, 'Genesis', 1, 1, 3, 600, 100, NULL, NULL);
    INSERT INTO ra_unlocks (game_row_id, user_id, achievement_id, earned_at) VALUES (1, 'one', 1, 900), (1, 'one', 2, 1800), (1, 'one', 3, 2600);
    INSERT INTO steam_connections (user_id, connection_id, steam_id, linked_at) VALUES ('one', 'steam', '1', 1);
    INSERT INTO steam_games (connection_id, app_id, name, playtime_minutes, last_played_at, observed_at, library_item_id) VALUES ('steam', 400, 'Marked', 300, 2000, 1, 1);`);
  const completions = db.prepare(eventCompletions).all("one", 1000, 5000).map((row) => ({ ...row }));
  assert.deepEqual(completions.sort((a, b) => Number(a.at) - Number(b.at)), [
    { libraryItemId: 1, stage: "beaten", at: 1500 }, { libraryItemId: 3, stage: "beaten", at: 2000 }, { libraryItemId: 3, stage: "completed", at: 2600 },
  ]);
  assert.deepEqual(db.prepare(eventAchievements).all("one", 1000, 5000).map((row) => ({ ...row })), [{ libraryItemId: 3, earned: 2 }]);
  assert.deepEqual(db.prepare(eventAchievements).all("one", 1000, 2000).map((row) => ({ ...row })), [{ libraryItemId: 3, earned: 1 }]);
  const sources = db.prepare(eventPlaytimeSources).all("one").map((row) => ({ ...row })).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  assert.deepEqual(sources, [
    { key: "ra:5", minutes: 120, lastPlayedAt: 2500, libraryItemId: 3 },
    { key: "ra:6", minutes: 10, lastPlayedAt: 100, libraryItemId: null },
    { key: "steam:400", minutes: 300, lastPlayedAt: 2000, libraryItemId: 1 },
  ]);
  db.close();
});

test("copying keeps the setup and multipliers but no players or results", () => {
  const db = database();
  db.exec("INSERT INTO event_multipliers (event_id, kind, target_id, name, hour_points, beaten_points, completed_points) VALUES (1, 'platform', 8, 'PlayStation 2', 20, 20, 0)");
  db.prepare(joinEvent).run(1, "one", 2000, 0);
  const copied = db.prepare(copyEvent).get(1, "two", 9000) as { id: number };
  db.prepare(copyEventMultipliers).run(1, copied.id);
  assert.deepEqual({ ...db.prepare("SELECT owner_id, name, visibility, starts_at FROM events WHERE id = ?").get(copied.id) }, { owner_id: "two", name: "Open (copy)", visibility: "public", starts_at: 1000 });
  assert.equal(db.prepare("SELECT count(*) AS n FROM event_multipliers WHERE event_id = ?").get(copied.id)!.n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM event_members WHERE event_id = ?").get(copied.id)!.n, 0);
  db.close();
});
