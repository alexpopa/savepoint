import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { gameFavorites } from "../db/schema";

export type GameFavorite = Omit<typeof gameFavorites.$inferSelect, "userId">;

export async function getGameFavorites(userId: string): Promise<GameFavorite[]> {
  const rows = await getDb().select().from(gameFavorites).where(eq(gameFavorites.userId, userId))
    .orderBy(asc(gameFavorites.sortOrder), asc(gameFavorites.id));
  return rows.map(({ id, igdbId, name, coverUrl, releaseYear, favoritedAt, sortOrder }) =>
    ({ id, igdbId, name, coverUrl, releaseYear, favoritedAt, sortOrder }));
}
