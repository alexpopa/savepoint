export const libraryPageSize = 12;

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
