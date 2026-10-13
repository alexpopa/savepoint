import assert from "node:assert/strict";
import test from "node:test";
import { eventGameList } from "../lib/event-game-view.ts";

const games = [
  { id: 1, name: "100% Orange_Juice", platformId: 6, addedAt: 300, minutes: 60, beaten: false, completed: false },
  { id: 2, name: "Orange Skies", platformId: 48, addedAt: 100, minutes: 180, beaten: true, completed: false },
  { id: 3, name: "Orange World", platformId: 6, addedAt: 200, minutes: 180, beaten: true, completed: true },
  { id: 4, name: "Another Game", platformId: 130, addedAt: 300, minutes: 0, beaten: false, completed: false },
];

test("event games sort by event addition date, with most hours breaking ties by newest addition", () => {
  assert.deepEqual(eventGameList(games, "", [], [], "newest").map(g => g.id), [4, 1, 3, 2]);
  assert.deepEqual(eventGameList(games, "", [], [], "hours").map(g => g.id), [3, 2, 1, 4]);
  assert.deepEqual(games.map(g => g.id), [1, 2, 3, 4]);
});

test("event title, platform, and result filters combine without losing 100% games from beaten", () => {
  assert.deepEqual(eventGameList(games, " ORANGE ", [6, 48], ["beaten"], "hours").map(g => g.id), [3, 2]);
  assert.deepEqual(eventGameList(games, "orange", [48], ["completed"], "newest"), []);
  assert.deepEqual(eventGameList(games, "", [], ["unbeaten"], "newest").map(g => g.id), [4, 1]);
  assert.deepEqual(eventGameList(games, "%", [], [], "newest").map(g => g.id), [1]);
  assert.deepEqual(eventGameList(games, "", [], ["completed"], "newest").map(g => g.id), [3]);
});

test("multiple event results match any selected stage, with empty selection showing all games", () => {
  assert.deepEqual(eventGameList(games, "", [], ["unbeaten", "completed"], "newest").map(g => g.id), [4, 1, 3]);
  assert.deepEqual(eventGameList(games, "", [], ["beaten", "completed"], "newest").map(g => g.id), [3, 2]);
  assert.deepEqual(eventGameList(games, "orange", [6], ["unbeaten", "completed"], "hours").map(g => g.id), [3, 1]);
});
