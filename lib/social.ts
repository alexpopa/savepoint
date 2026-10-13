import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, friendships, gameRatings, libraryItems } from "../db/schema";
import type { AppUser } from "../app/auth";
import { manualEventMinutes, sourceMinutes, sourceNames } from "./playtime-queries";
import { readPlaytime } from "./playtime";

export const privateResponse = { "cache-control": "private, no-store" };

export function accountDisplayName(account: { displayName: string; email: string }) {
  return account.displayName.toLowerCase() === account.email.toLowerCase()
    ? account.email.split("@")[0]
    : account.displayName;
}

export async function ensureAccount(user: AppUser) {
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.userId, user.userId));
  if (!account || !account.passwordHash || !account.emailVerifiedAt) throw new Error("Verified email account not found.");
  return account;
}

export function pairFor(first: string, second: string) {
  return first < second
    ? { userLow: first, userHigh: second }
    : { userLow: second, userHigh: first };
}

export function pairWhere(first: string, second: string) {
  const pair = pairFor(first, second);
  return and(eq(friendships.userLow, pair.userLow), eq(friendships.userHigh, pair.userHigh));
}

export async function getFriendship(first: string, second: string) {
  const [relation] = await getDb().select().from(friendships).where(pairWhere(first, second));
  return relation;
}

export async function getSocialState(userId: string) {
  const db = getDb();
  const relations = await db.select().from(friendships).where(
    or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)),
  );
  const otherIds = relations.map((row) => row.userLow === userId ? row.userHigh : row.userLow);
  const people = otherIds.length
    ? await db.select().from(accounts).where(and(isNotNull(accounts.passwordHash), isNotNull(accounts.emailVerifiedAt), or(...otherIds.map((id) => eq(accounts.userId, id)))))
    : [];
  const byId = new Map(people.map((person) => [person.userId, person]));
  return relations.flatMap((row) => {
    const otherId = row.userLow === userId ? row.userHigh : row.userLow;
    const person = byId.get(otherId);
    if (!person) return [];
    return [{
      userId: person.userId,
      displayName: person.displayName,
      email: person.email,
      isPublic: person.isPublic,
      status: row.status,
      direction: row.requesterId === userId ? "outgoing" as const : "incoming" as const,
    }];
  });
}

export function serializeGame(row: typeof libraryItems.$inferSelect, score: number | null = null, source: { minutes: number | null; names: string | null; eventMinutes?: number } = { minutes: null, names: null }) {
  return {
    id: row.id,
    igdbId: row.igdbId,
    name: row.name,
    coverUrl: row.coverUrl,
    releaseYear: row.releaseYear,
    platforms: JSON.parse(row.platformsJson) as string[],
    platformId: row.platformId,
    platformName: row.platformName,
    playingSince: row.playingSince,
    completedAt: row.completedAt,
    score,
    playtime: readPlaytime(row.playMinutes, source.minutes, source.names, source.eventMinutes),
  };
}

// A player's saved copies, newest first, each with that player's score for the game.
export async function getLibraryGames(userId: string) {
  const rows = await getDb().select({ item: libraryItems, score: gameRatings.score,
    sourceMinutes: sql<number | null>`${sql.raw(sourceMinutes("library_items"))}`, sourceNames: sql<string | null>`${sql.raw(sourceNames("library_items"))}`, eventMinutes: sql<number>`${sql.raw(manualEventMinutes("library_items"))}` }).from(libraryItems)
    .leftJoin(gameRatings, and(eq(gameRatings.userId, libraryItems.userId), eq(gameRatings.igdbId, libraryItems.igdbId)))
    .where(eq(libraryItems.userId, userId)).orderBy(desc(libraryItems.addedAt), desc(libraryItems.id));
  return rows.map(({ item, score, sourceMinutes, sourceNames, eventMinutes }) => serializeGame(item, score, { minutes: sourceMinutes, names: sourceNames, eventMinutes }));
}
