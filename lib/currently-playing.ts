import { getDb } from "../db";
import { currentlyPlayingQuery } from "./currently-playing-queries";

export type PlayingGame = { id: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null; playingSince: number; completedAt: number | null };

export async function getCurrentlyPlaying(userId: string): Promise<PlayingGame[]> {
  return (await getDb().$client.prepare(currentlyPlayingQuery).bind(userId).all<PlayingGame>()).results;
}
