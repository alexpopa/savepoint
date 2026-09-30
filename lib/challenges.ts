import { getDb } from "../db";
import { receivedChallengesQuery, sentChallengesQuery, type ChallengeRow } from "./challenge-queries";
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

function player(userId: string, displayName: string | null, email: string | null) {
  if (displayName === null || email === null) return { name: "Player", profilePath: `/users/${encodeURIComponent(userId)}` };
  const account = { userId, displayName, email };
  return { name: accountDisplayName(account), profilePath: profilePath(account) };
}

// Turns challenge rows into challenges, asking IGDB only for games no library or challenge has a
// cover for. Several lists share one lookup.
export async function toChallengeLists(...lists: ChallengeRow[][]): Promise<Challenge[][]> {
  const covers = new Map<number, string>();
  const missingCoverGames = [...new Map(lists.flat().filter((row) => !row.gameCoverUrl)
    .map((row) => [row.igdbId, { igdbId: row.igdbId, name: row.gameName, releaseYear: null }])).values()];
  if (missingCoverGames.length) {
    try {
      for (const [igdbId, cover] of await getIgdbGameCoversForGames(missingCoverGames)) if (cover.coverUrl) covers.set(igdbId, cover.coverUrl);
    } catch {
      // Keep challenge lists available when IGDB artwork lookup fails.
    }
  }
  return lists.map((rows) => rows.map((row) => {
    const recipient = player(row.recipientId, row.recipientDisplayName, row.recipientEmail);
    const creator = player(row.creatorId, row.creatorDisplayName, row.creatorEmail);
    return {
      id: row.id,
      recipientId: row.recipientId,
      creatorId: row.creatorId,
      recipientName: recipient.name,
      creatorName: creator.name,
      recipientProfilePath: recipient.profilePath,
      creatorProfilePath: creator.profilePath,
      igdbId: row.igdbId,
      gameName: row.gameName,
      gameCoverUrl: covers.get(row.igdbId) ?? row.gameCoverUrl,
      title: row.title,
      description: row.description,
      createdAt: row.createdAt,
      creatorConfirmed: Boolean(row.creatorConfirmed),
      recipientConfirmed: Boolean(row.recipientConfirmed),
      declined: Boolean(row.declined),
      isFavorite: Boolean(row.isFavorite),
      sortOrder: row.sortOrder,
    };
  }));
}

// A creator's own log does not reveal which challenges the recipient starred; admins still see it.
export function sentView(rows: Challenge[], includeRecipientFavorites: boolean) {
  return rows.map((row) => ({ ...row, isFavorite: includeRecipientFavorites && row.isFavorite }));
}

export async function receivedChallenges(userId: string) {
  const { results } = await getDb().$client.prepare(receivedChallengesQuery).bind(userId).all<ChallengeRow>();
  const [rows] = await toChallengeLists(results);
  return sortChallenges(rows);
}

export async function sentChallenges(userId: string, includeRecipientFavorites = false) {
  const { results } = await getDb().$client.prepare(sentChallengesQuery).bind(userId).all<ChallengeRow>();
  const [rows] = await toChallengeLists(results);
  return sentView(rows, includeRecipientFavorites);
}
