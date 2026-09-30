import assert from "node:assert/strict";
import test from "node:test";
import { filterLibraryGames, libraryPageSize, paginateLibraryGames, sortLibraryGames } from "../lib/library-view.ts";

const games = [
  { id: 1, name: "100% Orange_Juice", platformId: 6 },
  { id: 2, name: "1000 Orange Juice", platformId: 48 },
  { id: 3, name: "Orange Skies", platformId: 130 },
  { id: 4, name: "\u00dcber Game", platformId: 6 },
];

test("title and platform filters combine, with a case-insensitive title and any selected platform", () => {
  assert.deepEqual(filterLibraryGames(games, " ORANGE ", [6, 130]).map((game) => game.id), [1, 3]);
  assert.deepEqual(filterLibraryGames(games, "orange", [48]).map((game) => game.id), [2]);
  assert.deepEqual(filterLibraryGames(games, "  ", []).map((game) => game.id), [1, 2, 3, 4]);
  assert.deepEqual(filterLibraryGames(games, "missing", [6]).map((game) => game.id), []);
});

test("title search treats wildcard and escape characters literally", () => {
  assert.deepEqual(filterLibraryGames(games, "%", []).map((game) => game.id), [1]);
  assert.deepEqual(filterLibraryGames(games, "_", []).map((game) => game.id), [1]);
  assert.deepEqual(filterLibraryGames([{ name: "A\\B", platformId: 6 }], "\\", []).map((game) => game.name), ["A\\B"]);
});

test("pages hold twelve copies and return inclusive positions", () => {
  const copies = Array.from({ length: 27 }, (_, index) => index + 1);
  assert.equal(libraryPageSize, 12);
  assert.deepEqual(paginateLibraryGames(copies, 1), { items: copies.slice(0, 12), page: 1, pageCount: 3, first: 1, last: 12 });
  assert.deepEqual(paginateLibraryGames(copies, 2), { items: copies.slice(12, 24), page: 2, pageCount: 3, first: 13, last: 24 });
  assert.deepEqual(paginateLibraryGames(copies, 3), { items: copies.slice(24), page: 3, pageCount: 3, first: 25, last: 27 });
});

test("a stale page clamps after deletion or filtering", () => {
  const copies = Array.from({ length: 24 }, (_, index) => index + 1);
  assert.deepEqual(paginateLibraryGames(copies, 3), { items: copies.slice(12), page: 2, pageCount: 2, first: 13, last: 24 });
  assert.deepEqual(paginateLibraryGames(copies.slice(0, 13), 2), { items: [13], page: 2, pageCount: 2, first: 13, last: 13 });
  assert.equal(paginateLibraryGames(copies, -4).page, 1);
  assert.equal(paginateLibraryGames(copies, Number.NaN).page, 1);
});

test("an empty result has no pages or positions", () => {
  assert.deepEqual(paginateLibraryGames([], 7), { items: [], page: 1, pageCount: 0, first: 0, last: 0 });
});

test("sorting by score or completion keeps newest-first order among ties", () => {
  const copies = [
    { id: 1, score: null, completedAt: null },
    { id: 2, score: 3, completedAt: 100 },
    { id: 3, score: 5, completedAt: null },
    { id: 4, score: 3, completedAt: 300 },
    { id: 5 },
  ];
  assert.deepEqual(sortLibraryGames(copies, "newest").map((game) => game.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(sortLibraryGames(copies, "score").map((game) => game.id), [3, 2, 4, 1, 5]);
  assert.deepEqual(sortLibraryGames(copies, "completed").map((game) => game.id), [4, 2, 1, 3, 5]);
});
