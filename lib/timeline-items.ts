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
export type TimelineCompleted = Omit<TimelinePlaying, "kind"> & { kind: "completed" };
export type TimelineRating = { id: number; igdbId: number; name: string; releaseYear: number | null; coverUrl: string | null; score: number; ratedAt: number; person: TimelinePerson };
export type RatingBatch = { kind: "ratings"; key: string; at: number; person: TimelinePerson; games: TimelineRating[] };
export type TimelineItem = LibraryBatch | TimelineChallenge | TimelineFavorite | TimelinePlaying | TimelineCompleted | RatingBatch;

// Each friend's newest ungrouped item starts a batch holding everything from the 24 hours before it.
function batchByPerson<T extends { id: number; person: TimelinePerson }, B extends { at: number; games: T[] }>(items: T[], at: (item: T) => number, start: (item: T) => B): B[] {
  const batches: B[] = [];
  const current = new Map<string, B>();
  for (const item of [...items].sort((a, b) => at(b) - at(a) || b.id - a.id)) {
    let batch = current.get(item.person.id);
    if (!batch || batch.at - at(item) > BATCH_WINDOW) {
      batch = start(item);
      current.set(item.person.id, batch);
      batches.push(batch);
    }
    batch.games.push(item);
  }
  return batches;
}

export function batchLibraryGames(games: TimelineGame[]): LibraryBatch[] {
  return batchByPerson(games, (game) => game.addedAt, (game): LibraryBatch => ({ kind: "library", key: `library:${game.id}`, at: game.addedAt, person: game.person, games: [] }));
}

export function batchRatings(ratings: TimelineRating[]): RatingBatch[] {
  return batchByPerson(ratings, (rating) => rating.ratedAt, (rating): RatingBatch => ({ kind: "ratings", key: `ratings:${rating.id}`, at: rating.ratedAt, person: rating.person, games: [] }));
}

export function recentTimeline(games: TimelineGame[], challenges: TimelineChallenge[], favorites: TimelineFavorite[] = [], playing: TimelinePlaying[] = [], completed: TimelineCompleted[] = [], ratings: TimelineRating[] = []): TimelineItem[] {
  return [...batchLibraryGames(games), ...challenges, ...favorites, ...playing, ...completed, ...batchRatings(ratings)]
    .sort((a, b) => b.at - a.at || a.key.localeCompare(b.key)).slice(0, 30);
}
