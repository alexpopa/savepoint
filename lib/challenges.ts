import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, challenges } from "../db/schema";
import { profilePath } from "./profile-path";
import { accountDisplayName } from "./social";

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
    gameCoverUrl: row.gameCoverUrl,
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

export async function sentChallenges(userId: string) {
  const rows = await getDb().select().from(challenges).where(eq(challenges.creatorId, userId)).orderBy(desc(challenges.id));
  return (await decorate(rows)).map((row) => ({ ...row, isFavorite: false }));
}
