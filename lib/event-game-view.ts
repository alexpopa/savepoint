import { filterLibraryGames } from "./library-view.ts";

export const eventGameSorts = [["newest", "Newest added"], ["hours", "Most hours played"]] as const;
export type EventGameSort = typeof eventGameSorts[number][0];
export const eventGameFilters = [["unbeaten", "Not beaten"], ["beaten", "Beaten"], ["completed", "100%"]] as const;
export type EventGameFilter = typeof eventGameFilters[number][0];

type Game = { id: number; name: string; platformId: number; addedAt: number; minutes: number; beaten: boolean; completed: boolean };

// Event stages combine with the collection's literal title and multi-platform filters.
export function eventGameList<T extends Game>(games: T[], query: string, platformIds: number[], filters: EventGameFilter[], sort: EventGameSort): T[] {
  return filterLibraryGames(games, query, platformIds).filter((game) =>
    !filters.length || filters.some((filter) => filter === "unbeaten" ? !game.beaten && !game.completed : filter === "beaten" ? game.beaten || game.completed : game.completed))
    .sort((a, b) => (sort === "hours" ? b.minutes - a.minutes : 0) || b.addedAt - a.addedAt || b.id - a.id);
}
