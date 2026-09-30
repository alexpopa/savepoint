export const libraryPageSize = 12;

export const librarySorts = [["newest", "Newest added"], ["score", "Highest rated"], ["completed", "Completed first"]] as const;
export type LibrarySort = typeof librarySorts[number][0];

// Copies arrive newest first; the stable sort keeps that order among ties.
export function sortLibraryGames<T extends { score?: number | null; completedAt?: number | null }>(games: T[], sort: LibrarySort): T[] {
  if (sort === "score") return [...games].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (sort === "completed") return [...games].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return games;
}

export function filterLibraryGames<T extends { name: string; platformId: number }>(games: T[], query: string, platformIds: number[]): T[] {
  const title = query.trim().toLowerCase();
  const platforms = new Set(platformIds);
  return games.filter((game) =>
    (!title || game.name.toLowerCase().includes(title)) && (!platforms.size || platforms.has(game.platformId)));
}

export function paginateLibraryGames<T>(games: T[], requestedPage: number): { items: T[]; page: number; pageCount: number; first: number; last: number } {
  const pageCount = Math.ceil(games.length / libraryPageSize);
  const page = pageCount ? Math.min(Math.max(Number.isSafeInteger(requestedPage) ? requestedPage : 1, 1), pageCount) : 1;
  const offset = (page - 1) * libraryPageSize;
  const items = games.slice(offset, offset + libraryPageSize);
  return { items, page, pageCount, first: items.length ? offset + 1 : 0, last: items.length ? offset + items.length : 0 };
}
