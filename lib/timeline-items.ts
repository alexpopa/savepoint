export const BATCH_WINDOW = 24 * 60 * 60 * 1000;
export type TimelinePerson = { id: string; name: string; href: string };
export type TimelineGame = { id: number; igdbId: number; name: string; releaseYear: number | null; platformName: string | null; coverUrl: string | null; addedAt: number; person: TimelinePerson };
export type LibraryBatch = { kind: "library"; key: string; at: number; person: TimelinePerson; games: TimelineGame[] };
export type TimelineChallenge = {
  kind: "challenge"; key: string; id: number; at: number; createdAt: number;
  title: string; description: string; gameName: string; coverUrl: string | null;
  creator: TimelinePerson; recipient: TimelinePerson;
  state: "pending" | "claimed" | "completed";
};
export type TimelineFavorite = {
  kind: "favorite"; key: string; at: number; person: TimelinePerson;
  igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null;
};
export type TimelinePlaying = {
  kind: "playing"; key: string; at: number; person: TimelinePerson;
  igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null;
};
export type TimelineItem = LibraryBatch | TimelineChallenge | TimelineFavorite | TimelinePlaying;

export function batchLibraryGames(games: TimelineGame[]): LibraryBatch[] {
  const batches: LibraryBatch[] = [];
  const current = new Map<string, LibraryBatch>();
  for (const game of [...games].sort((a, b) => b.addedAt - a.addedAt || b.id - a.id)) {
    let batch = current.get(game.person.id);
    if (!batch || batch.at - game.addedAt > BATCH_WINDOW) {
      batch = { kind: "library", key: `library:${game.id}`, at: game.addedAt, person: game.person, games: [] };
      current.set(game.person.id, batch);
      batches.push(batch);
    }
    batch.games.push(game);
  }
  return batches;
}

export function recentTimeline(games: TimelineGame[], challenges: TimelineChallenge[], favorites: TimelineFavorite[] = [], playing: TimelinePlaying[] = []): TimelineItem[] {
  return [...batchLibraryGames(games), ...challenges, ...favorites, ...playing]
    .sort((a, b) => b.at - a.at || a.key.localeCompare(b.key)).slice(0, 30);
}
