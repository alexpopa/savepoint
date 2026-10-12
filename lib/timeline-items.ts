export const BATCH_WINDOW = 24 * 60 * 60 * 1000;
export type TimelinePerson = { id: string; name: string; href: string };
export type TimelineGame = { id: number; igdbId: number; name: string; releaseYear: number | null; platformName: string | null; coverUrl: string | null; addedAt: number; person: TimelinePerson };
export const timelineLibraryLimit = 100;
export type LibraryBatch = { kind: "library"; key: string; at: number; person: TimelinePerson; games: TimelineGame[]; gameCount: number };
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
export type TimelineUnlock = { id: number; titleRowId: number; achievementName: string; iconUrl: string | null; gamerscore: number; unlockedAt: number; person: TimelinePerson;
  igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null };
export type AchievementBatch = Omit<TimelineUnlock, "id" | "achievementName" | "iconUrl" | "gamerscore" | "unlockedAt"> & { kind: "achievements"; key: string; at: number; unlocks: TimelineUnlock[] };
export type TimelineMastered = Omit<TimelinePlaying, "kind"> & { kind: "mastered"; titleRowId: number; totalAchievements: number; totalGamerscore: number };
export type TimelineTrophy = { id: number; titleRowId: number; trophyName: string; grade: string; earnedAt: number; person: TimelinePerson;
  igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null };
export type TrophyBatch = Omit<TimelineTrophy, "id" | "trophyName" | "grade" | "earnedAt"> & { kind: "trophies"; key: string; at: number; trophies: TimelineTrophy[] };
export type TimelinePlatinum = Omit<TimelinePlaying, "kind"> & { kind: "platinum"; titleRowId: number; hasPlatinum: boolean; totalTrophies: number };
export type TimelineItem = LibraryBatch | TimelineChallenge | TimelineFavorite | TimelinePlaying | TimelineCompleted | RatingBatch | AchievementBatch | TimelineMastered | TrophyBatch | TimelinePlatinum;

// Each friend's newest ungrouped item starts a batch holding everything from the 24 hours before it.
function batchByPerson<T extends { id: number; person: TimelinePerson }, B extends { at: number }>(items: T[], at: (item: T) => number, start: (item: T) => B,
  entries: (batch: B) => T[] = (batch) => (batch as B & { games: T[] }).games, group: (item: T) => string = (item) => item.person.id): B[] {
  const batches: B[] = [];
  const current = new Map<string, B>();
  for (const item of [...items].sort((a, b) => at(b) - at(a) || b.id - a.id)) {
    let batch = current.get(group(item));
    if (!batch || batch.at - at(item) > BATCH_WINDOW) {
      batch = start(item);
      current.set(group(item), batch);
      batches.push(batch);
    }
    entries(batch).push(item);
  }
  return batches;
}

// Achievement unlocks batch the same way, but separately for each friend's game.
export const achievementGroup = (item: { person: TimelinePerson; titleRowId: number }) => `${item.person.id}:${item.titleRowId}`;
export function batchAchievements(unlocks: TimelineUnlock[]): AchievementBatch[] {
  return batchByPerson(unlocks, (unlock) => unlock.unlockedAt, ({ titleRowId, person, igdbId, name, coverUrl, releaseYear, platformName, id, unlockedAt }): AchievementBatch => ({
    kind: "achievements", key: `achievements:${id}`, at: unlockedAt, titleRowId, person, igdbId, name, coverUrl, releaseYear, platformName, unlocks: [] }), (batch) => batch.unlocks, achievementGroup);
}

// PlayStation trophies batch like achievements, per friend and game, with their own floors.
export function batchTrophies(trophies: TimelineTrophy[]): TrophyBatch[] {
  return batchByPerson(trophies, (trophy) => trophy.earnedAt, ({ titleRowId, person, igdbId, name, coverUrl, releaseYear, platformName, id, earnedAt }): TrophyBatch => ({
    kind: "trophies", key: `trophies:${id}`, at: earnedAt, titleRowId, person, igdbId, name, coverUrl, releaseYear, platformName, trophies: [] }), (batch) => batch.trophies, achievementGroup);
}

export function batchLibraryGames(games: TimelineGame[]): LibraryBatch[] {
  return batchByPerson(games, (game) => game.addedAt, (game): LibraryBatch => ({ kind: "library", key: `library:${game.id}`, at: game.addedAt, person: game.person, games: [], gameCount: 0 }))
    .map((batch) => ({ ...batch, gameCount: batch.games.length }));
}

export function batchRatings(ratings: TimelineRating[]): RatingBatch[] {
  return batchByPerson(ratings, (rating) => rating.ratedAt, (rating): RatingBatch => ({ kind: "ratings", key: `ratings:${rating.id}`, at: rating.ratedAt, person: rating.person, games: [] }));
}

export function mergeTimeline(games: TimelineGame[], challenges: TimelineChallenge[], favorites: TimelineFavorite[] = [], playing: TimelinePlaying[] = [], completed: TimelineCompleted[] = [], ratings: TimelineRating[] = [],
  achievements: TimelineUnlock[] = [], mastered: TimelineMastered[] = [], trophies: TimelineTrophy[] = [], platinum: TimelinePlatinum[] = []): TimelineItem[] {
  return [...batchLibraryGames(games), ...challenges, ...favorites, ...playing, ...completed, ...batchRatings(ratings), ...batchAchievements(achievements), ...mastered,
    ...batchTrophies(trophies), ...platinum].sort(timelineOrder);
}

export const timelinePageSize = 15;
const timelineOrder = (a: Pick<TimelineItem, "at" | "key">, b: Pick<TimelineItem, "at" | "key">) => b.at - a.at || a.key.localeCompare(b.key);

// `at`/`key` is the last entry shown. Floors hold, per friend, the start of their oldest shown batch window:
// rows at or after it already belong to a shown batch, so later pages start that friend's next batch below it.
// Achievement and trophy floors are keyed by friend and game (`achievementGroup`).
export type TimelineCursor = { at: number; key: string; library: Record<string, number>; ratings: Record<string, number>; achievements: Record<string, number>; trophies: Record<string, number> };
// Rows newest first, as read with a limit; `truncated` means the limit was reached and older rows may exist.
export type TimelineSource<T> = { rows: T[]; truncated: boolean };
export type TimelineSources = {
  games: TimelineSource<TimelineGame>; challenges: TimelineSource<TimelineChallenge>; favorites: TimelineSource<TimelineFavorite>;
  playing: TimelineSource<TimelinePlaying>; completed: TimelineSource<TimelineCompleted>; ratings: TimelineSource<TimelineRating>;
  achievements?: TimelineSource<TimelineUnlock>; mastered?: TimelineSource<TimelineMastered>; trophies?: TimelineSource<TimelineTrophy>; platinum?: TimelineSource<TimelinePlatinum>;
};

// Returns null when truncated sources leave too few entries known to be complete, so the caller reads more rows.
export function timelinePage(sources: TimelineSources, cursor: TimelineCursor | null, size = timelinePageSize) {
  const { games, challenges, favorites, playing, completed, ratings, achievements = { rows: [], truncated: false }, mastered = { rows: [], truncated: false },
    trophies = { rows: [], truncated: false }, platinum = { rows: [], truncated: false } } = sources;
  // Entries newer than the horizon are exact: a batch is complete once its whole 24-hour window was read.
  const horizon = Math.max(-Infinity,
    ...[challenges, favorites, playing, completed, mastered, platinum].flatMap((source) => source.truncated ? [source.rows.at(-1)!.at] : []),
    ...(games.truncated ? [games.rows.at(-1)!.addedAt + BATCH_WINDOW] : []),
    ...(ratings.truncated ? [ratings.rows.at(-1)!.ratedAt + BATCH_WINDOW] : []),
    ...(achievements.truncated ? [achievements.rows.at(-1)!.unlockedAt + BATCH_WINDOW] : []),
    ...(trophies.truncated ? [trophies.rows.at(-1)!.earnedAt + BATCH_WINDOW] : []));
  const entries = mergeTimeline(games.rows, challenges.rows, favorites.rows, playing.rows, completed.rows, ratings.rows, achievements.rows, mastered.rows, trophies.rows, platinum.rows)
    .filter((item) => item.at > horizon && (!cursor || timelineOrder(cursor, item) < 0));
  if (entries.length < size && horizon > -Infinity) return null;
  // Count the entire window before capping the serialized games, so imports stay one entry and cursors skip the whole batch.
  const items = entries.slice(0, size).map((item) => item.kind === "library" ? { ...item, games: item.games.slice(0, timelineLibraryLimit) } : item);
  const last = items.at(-1);
  const more = entries.length > size || horizon > -Infinity;
  return { items, next: more && last ? JSON.stringify(nextCursor(cursor, items, last)) : null };
}

function nextCursor(cursor: TimelineCursor | null, items: TimelineItem[], last: TimelineItem): TimelineCursor {
  const floors = (kind: "library" | "ratings" | "achievements" | "trophies") => {
    const result = { ...cursor?.[kind] };
    for (const item of items) if (item.kind === kind) {
      const group = item.kind === "achievements" || item.kind === "trophies" ? achievementGroup(item) : item.person.id;
      result[group] = Math.min(result[group] ?? Infinity, item.at - BATCH_WINDOW);
    }
    // Rows newer than the cursor are never read again, so floors above it no longer matter.
    return Object.fromEntries(Object.entries(result).filter(([, floor]) => floor <= last.at));
  };
  return { at: last.at, key: last.key, library: floors("library"), ratings: floors("ratings"), achievements: floors("achievements"), trophies: floors("trophies") };
}

const maxCursorFloors = 500;
// Returns null for malformed input so the route can answer 400 instead of guessing.
export function parseTimelineCursor(raw: string): TimelineCursor | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const { at, key, library, ratings, achievements = {}, trophies = {} } = (value ?? {}) as Record<string, unknown>;
  const validFloors = (floors: unknown): floors is Record<string, number> => typeof floors === "object" && floors !== null && !Array.isArray(floors)
    && Object.keys(floors).length <= maxCursorFloors && Object.entries(floors).every(([id, floor]) => id.length <= 100 && Number.isSafeInteger(floor));
  if (typeof at !== "number" || !Number.isSafeInteger(at) || typeof key !== "string" || !/^(library|challenge|favorite|playing|completed|ratings|achievements|mastered|trophies|platinum):\d+$/.test(key)
    || !validFloors(library) || !validFloors(ratings) || !validFloors(achievements) || !validFloors(trophies)) return null;
  return { at, key, library, ratings, achievements, trophies };
}
