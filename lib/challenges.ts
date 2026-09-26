import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, challenges, libraryItems } from "../db/schema";
import { profilePath } from "./profile-path";
import { accountDisplayName } from "./social";
import { getIgdbGameCoversForGames } from "./igdb";

export type Challenge = {
  id: number;
  recipientId: string;
  creatorId: string;
  recipientName: string;
  creatorName: string;
  recipientProfilePath: string;
  creatorProfilePath: string;
  igdbId: number;
  gameName: string;
  gameCoverUrl: string | null;
  title: string;
  description: string;
  createdAt: number;
  creatorConfirmed: boolean;
  recipientConfirmed: boolean;
  declined: boolean;
  isFavorite: boolean;
  sortOrder: number;
};

export type ChallengeDetails = Pick<Challenge,
  "id" | "creatorId" | "recipientId" | "creatorName" | "recipientName" |
  "creatorProfilePath" | "recipientProfilePath" | "gameName" | "gameCoverUrl" | "title" | "description"
>;

export function isComplete(challenge: Challenge) {
  return challenge.creatorConfirmed && challenge.recipientConfirmed && !challenge.declined;
}

export function sortChallenges(rows: Challenge[]) {
  return [...rows].sort((a, b) =>
    Number(b.isFavorite) - Number(a.isFavorite) || b.sortOrder - a.sortOrder || b.id - a.id,
  );
}

async function decorate(rows: (typeof challenges.$inferSelect)[]): Promise<Challenge[]> {
  const ids = [...new Set(rows.flatMap((row) => [row.creatorId, row.recipientId]))];
  const batches = await Promise.all(Array.from({ length: Math.ceil(ids.length / 400) }, (_, index) =>
    getDb().select().from(accounts).where(inArray(accounts.userId, ids.slice(index * 400, (index + 1) * 400))),
  ));
  const people = batches.flat();
  const gameIds = [...new Set(rows.map((row) => row.igdbId))];
  const gameBatches = await Promise.all(Array.from({ length: Math.ceil(gameIds.length / 400) }, (_, index) =>
    getDb().select({ userId: libraryItems.userId, igdbId: libraryItems.igdbId, coverUrl: libraryItems.coverUrl })
      .from(libraryItems)
      .where(inArray(libraryItems.igdbId, gameIds.slice(index * 400, (index + 1) * 400))),
  ));
  const currentCovers = new Map<number, string>();
  for (const game of gameBatches.flat()) {
    if (game.coverUrl && !currentCovers.has(game.igdbId)) currentCovers.set(game.igdbId, game.coverUrl);
  }
  const missingCoverGames = [...new Map(rows.filter((row) => !currentCovers.has(row.igdbId) && !row.gameCoverUrl)
    .map((row) => [row.igdbId, { igdbId: row.igdbId, name: row.gameName, releaseYear: null }])).values()];
  if (missingCoverGames.length) {
    try {
      const covers = await getIgdbGameCoversForGames(missingCoverGames);
      for (const [igdbId, cover] of covers) if (cover.coverUrl) currentCovers.set(igdbId, cover.coverUrl);
    } catch {
      // Keep challenge lists available when IGDB artwork lookup fails.
    }
  }
  const names = new Map(people.map((person) => [person.userId, accountDisplayName(person)]));
  const profilePaths = new Map(people.map((person) => [person.userId, profilePath(person)]));
  return rows.map((row) => ({
    id: row.id,
    recipientId: row.recipientId,
    creatorId: row.creatorId,
    recipientName: names.get(row.recipientId) ?? "Player",
    creatorName: names.get(row.creatorId) ?? "Player",
    recipientProfilePath: profilePaths.get(row.recipientId) ?? `/users/${encodeURIComponent(row.recipientId)}`,
    creatorProfilePath: profilePaths.get(row.creatorId) ?? `/users/${encodeURIComponent(row.creatorId)}`,
    igdbId: row.igdbId,
    gameName: row.gameName,
    // Prefer the current library cover; challenge rows may have been created before it was recovered.
    gameCoverUrl: currentCovers.get(row.igdbId) ?? row.gameCoverUrl,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt,
    creatorConfirmed: row.creatorConfirmed,
    recipientConfirmed: row.recipientConfirmed,
    declined: row.declinedAt !== null,
    isFavorite: row.isFavorite,
    sortOrder: row.sortOrder,
  }));
}

export async function receivedChallenges(userId: string) {
  const rows = await getDb().select().from(challenges).where(eq(challenges.recipientId, userId)).orderBy(desc(challenges.id));
  return sortChallenges((await decorate(rows)).filter((row) => !row.declined));
}

export async function sentChallenges(userId: string, includeRecipientFavorites = false) {
  const rows = await getDb().select().from(challenges).where(eq(challenges.creatorId, userId)).orderBy(desc(challenges.id));
  return (await decorate(rows)).map((row) => ({ ...row, isFavorite: includeRecipientFavorites && row.isFavorite }));
}
