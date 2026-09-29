import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { libraryItems } from "../db/schema";

export type PlayingGame = { id: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null; playingSince: number };

export async function getCurrentlyPlaying(userId: string): Promise<PlayingGame[]> {
  const rows = await getDb().select().from(libraryItems).where(and(eq(libraryItems.userId, userId), isNotNull(libraryItems.playingSince)))
    .orderBy(desc(libraryItems.playingSince), desc(libraryItems.id));
  return rows.map(({ id, igdbId, name, coverUrl, releaseYear, platformName, playingSince }) =>
    ({ id, igdbId, name, coverUrl, releaseYear, platformName, playingSince: playingSince! }));
}
