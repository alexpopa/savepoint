import { getDb } from "../db";
import type { AppUser } from "../app/auth";
import { receivedChallengesQuery, sentChallengesQuery, type ChallengeRow } from "./challenge-queries";
import { sortChallenges, sentView, toChallengeLists } from "./challenges";
import { currentlyPlayingQuery } from "./currently-playing-queries";
import type { PlayingGame } from "./currently-playing";
import { gameFavoritesQuery } from "./game-favorite-queries";
import type { GameFavorite } from "./game-favorites";
import { hasPermission } from "./permissions";
import { libraryStatsQuery, profileAccountQuery } from "./profile-queries";

// Everything My profile shows, read in one D1 round trip.
export async function getOwnProfile(user: AppUser) {
  const client = getDb().$client;
  const [account, received, sent, favorites, playing, stats] = await client.batch([
    profileAccountQuery, receivedChallengesQuery, sentChallengesQuery, gameFavoritesQuery, currentlyPlayingQuery, libraryStatsQuery,
  ].map((query) => client.prepare(query).bind(user.userId)));
  const [owner] = account.results as { isPublic: number; verified: number }[];
  if (!owner?.verified) throw new Error("Verified email account not found.");
  const [receivedChallenges, sentChallenges] = await toChallengeLists(received.results as ChallengeRow[], sent.results as ChallengeRow[]);
  const [library] = stats.results as { games: number; completed: number }[];
  return {
    isPublic: Boolean(owner.isPublic),
    received: sortChallenges(receivedChallenges),
    sent: sentView(sentChallenges, hasPermission(user, false)),
    favorites: favorites.results as GameFavorite[],
    playing: playing.results as PlayingGame[],
    games: library?.games ?? 0,
    completed: library?.completed ?? 0,
  };
}
