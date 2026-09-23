import { and, eq, or } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, friendships, libraryItems } from "../db/schema";
import type { ChatGPTUser } from "../app/chatgpt-auth";

export const privateResponse = { "cache-control": "private, no-store" };

export function accountDisplayName(account: { displayName: string; email: string }) {
  return account.displayName.toLowerCase() === account.email.toLowerCase()
    ? account.email.split("@")[0]
    : account.displayName;
}

export async function ensureAccount(user: ChatGPTUser) {
  const email = user.email.trim().toLowerCase();
  const db = getDb();
  await db.insert(accounts).values({
    userId: user.userId,
    email,
    displayName: user.fullName?.trim() || user.email,
  }).onConflictDoUpdate({
    target: accounts.userId,
    set: { email, displayName: user.fullName?.trim() || user.email },
  });
  const [account] = await db.select().from(accounts).where(eq(accounts.userId, user.userId));
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
    ? await db.select().from(accounts).where(or(...otherIds.map((id) => eq(accounts.userId, id))))
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

export function serializeGame(row: typeof libraryItems.$inferSelect) {
  return {
    id: row.id,
    igdbId: row.igdbId,
    name: row.name,
    coverUrl: row.coverUrl,
    releaseYear: row.releaseYear,
    platforms: JSON.parse(row.platformsJson) as string[],
  };
}
