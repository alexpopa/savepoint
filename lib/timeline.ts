import { waitUntil } from "cloudflare:workers";
import { getDb } from "../db";
import { accountDisplayName } from "./social";
import { profilePath } from "./profile-path";
import { timelinePage, timelinePageSize, type TimelineCursor, type TimelineGame, type TimelineItem } from "./timeline-items";
import {
  saveRecoveredCoverQuery, timelineAchievementsQuery, timelineBeatenQuery, timelineRaUnlocksQuery, timelinePlatinumQuery, timelineTrophiesQuery, timelineChallengesQuery, timelineMasteredQuery, timelineCompletedQuery, timelineFavoritesQuery, timelineLibraryQuery, timelinePlayingQuery, timelineRatingsQuery,
  type TimelineChallengeRow, type TimelineCopyRow, type TimelineFavoriteRow, type TimelineMasteredRow, type TimelinePlatinumRow, type TimelineTrophyRow, type TimelinePersonRow, type TimelineRatingRow, type TimelineUnlockRow,
  type TimelineBeatenRow, type TimelineRaUnlockRow,
} from "./timeline-queries";
import { getIgdbGameCoversForGames } from "./igdb";
import { hasPermission, type PermissionUser } from "./permissions";

const batchedRowLimit = 100;
// Missing artwork must not hold the page for long; slower lookups still save their covers for the next load.
const coverWaitMs = 1500;

export async function getTimelinePage(user: PermissionUser, cursor: TimelineCursor | null) {
  const client = getDb().$client;
  const newest = cursor?.at ?? Number.MAX_SAFE_INTEGER;
  // One JSON parameter keeps the floors under D1's bound-parameter limit however many friends appear.
  const floors = (kind: "library" | "ratings" | "achievements" | "trophies" | "retroachievements") => JSON.stringify(cursor?.[kind] ?? {});
  const person = (row: TimelinePersonRow) => ({ id: row.userId, name: accountDisplayName(row), href: profilePath(row) });
  const source = <T>(rows: T[], limit: number) => ({ rows, truncated: rows.length === limit });
  const copyEntry = ({ igdbId, name, coverUrl, releaseYear, platformName, ...row }: TimelineCopyRow) => ({ person: person(row), igdbId, name, coverUrl, releaseYear, platformName });

  // Single entries are read one page at a time; batched rows grow until every shown batch is complete.
  for (let singleLimit = timelinePageSize + 1, batchedLimit = batchedRowLimit; ; singleLimit *= 4, batchedLimit *= 4) {
    const [games, challenges, favorites, playing, completed, ratings, unlocks, mastered, trophies, platinum, raUnlocks, beaten] = await client.batch([
      client.prepare(timelineLibraryQuery).bind(user.userId, newest, floors("library"), batchedLimit),
      client.prepare(timelineChallengesQuery).bind(user.userId, newest, "{}", singleLimit, hasPermission(user, false) ? 1 : 0),
      client.prepare(timelineFavoritesQuery).bind(user.userId, newest, "{}", singleLimit),
      client.prepare(timelinePlayingQuery).bind(user.userId, newest, "{}", singleLimit),
      client.prepare(timelineCompletedQuery).bind(user.userId, newest, "{}", singleLimit),
      client.prepare(timelineRatingsQuery).bind(user.userId, newest, floors("ratings"), batchedLimit),
      client.prepare(timelineAchievementsQuery).bind(user.userId, newest, floors("achievements"), batchedLimit),
      client.prepare(timelineMasteredQuery).bind(user.userId, newest, "{}", singleLimit),
      client.prepare(timelineTrophiesQuery).bind(user.userId, newest, floors("trophies"), batchedLimit),
      client.prepare(timelinePlatinumQuery).bind(user.userId, newest, "{}", singleLimit),
      client.prepare(timelineRaUnlocksQuery).bind(user.userId, newest, floors("retroachievements"), batchedLimit),
      client.prepare(timelineBeatenQuery).bind(user.userId, newest, "{}", singleLimit),
    ]);
    const page = timelinePage({
      games: source((games.results as TimelineCopyRow[]).map((row) => ({
        id: row.id, igdbId: row.igdbId, name: row.name, releaseYear: row.releaseYear, platformName: row.platformName, coverUrl: row.coverUrl,
        addedAt: row.at, person: person(row),
      })), batchedLimit),
      challenges: source((challenges.results as TimelineChallengeRow[]).map((row) => ({
        kind: "challenge" as const, key: `challenge:${row.id}`, id: row.id, at: row.at, createdAt: row.createdAt,
        title: row.title, description: row.description, gameName: row.gameName, coverUrl: row.coverUrl,
        creator: person({ userId: row.creatorUserId, displayName: row.creatorDisplayName, email: row.creatorEmail }),
        recipient: person({ userId: row.recipientUserId, displayName: row.recipientDisplayName, email: row.recipientEmail }),
        state: row.recipientConfirmed ? row.creatorConfirmed ? "completed" as const : "claimed" as const : "pending" as const,
      })), singleLimit),
      favorites: source((favorites.results as TimelineFavoriteRow[]).map((row) => ({
        kind: "favorite" as const, key: `favorite:${row.id}`, at: row.at,
        person: person(row), igdbId: row.igdbId, name: row.name, coverUrl: row.coverUrl, releaseYear: row.releaseYear,
      })), singleLimit),
      playing: source((playing.results as TimelineCopyRow[]).map((row) => ({ kind: "playing" as const, key: `playing:${row.id}`, at: row.at, ...copyEntry(row) })), singleLimit),
      completed: source((completed.results as TimelineCopyRow[]).map((row) => ({ kind: "completed" as const, key: `completed:${row.id}`, at: row.at, ...copyEntry(row) })), singleLimit),
      ratings: source((ratings.results as TimelineRatingRow[]).map((row) => ({
        id: row.id, igdbId: row.igdbId, name: row.name, releaseYear: row.releaseYear, coverUrl: row.coverUrl,
        score: row.score, ratedAt: row.at, person: person(row),
      })), batchedLimit),
      achievements: source((unlocks.results as TimelineUnlockRow[]).map((row) => ({
        id: row.id, titleRowId: row.titleRowId, achievementName: row.achievementName, iconUrl: row.iconUrl, gamerscore: row.gamerscore, unlockedAt: row.at, person: person(row),
        igdbId: row.igdbId, name: row.name, coverUrl: row.coverUrl, releaseYear: row.releaseYear, platformName: row.platformName,
      })), batchedLimit),
      mastered: source((mastered.results as TimelineMasteredRow[]).map((row) => ({ kind: "mastered" as const, key: `mastered:${row.id}`, at: row.at, ...copyEntry(row),
        titleRowId: row.titleRowId, totalAchievements: row.totalAchievements, totalGamerscore: row.totalGamerscore })), singleLimit),
      trophies: source((trophies.results as TimelineTrophyRow[]).map((row) => ({
        id: row.id, titleRowId: row.titleRowId, trophyName: row.trophyName, grade: row.grade, earnedAt: row.at, person: person(row),
        igdbId: row.igdbId, name: row.name, coverUrl: row.coverUrl, releaseYear: row.releaseYear, platformName: row.platformName,
      })), batchedLimit),
      platinum: source((platinum.results as TimelinePlatinumRow[]).map((row) => ({ kind: "platinum" as const, key: `platinum:${row.id}`, at: row.at, ...copyEntry(row),
        titleRowId: row.titleRowId, hasPlatinum: Boolean(row.hasPlatinum), totalTrophies: row.totalTrophies })), singleLimit),
      retroachievements: source((raUnlocks.results as TimelineRaUnlockRow[]).map((row) => ({
        id: row.id, titleRowId: row.titleRowId, achievementName: row.achievementName, hardcore: Boolean(row.hardcore), earnedAt: row.at, person: person(row),
        igdbId: row.igdbId, name: row.name, coverUrl: row.coverUrl, releaseYear: row.releaseYear, platformName: row.platformName,
      })), batchedLimit),
      beaten: source((beaten.results as TimelineBeatenRow[]).map((row) => ({ kind: "beaten" as const, key: `beaten:${row.id}`, at: row.at, ...copyEntry(row),
        titleRowId: row.titleRowId, hardcore: Boolean(row.hardcore) })), singleLimit),
    }, cursor);
    if (!page) continue;
    await recoverCovers(page.items);
    return page;
  }
}

// Recover legacy artwork only for the initial visible covers, keeping imports cheap, and store what IGDB finds.
async function recoverCovers(items: TimelineItem[]) {
  const references = items.flatMap((item) => item.kind === "library" ? item.games.slice(0, 4).filter((game) => !game.coverUrl) : []);
  if (!references.length) return;
  // Artwork availability must never hide friend activity.
  const lookup = getIgdbGameCoversForGames(references).catch(() => null);
  waitUntil(lookup.then((covers) => covers && saveCovers(references, covers)).catch(() => undefined));
  const covers = await Promise.race([lookup, new Promise<null>((resolve) => setTimeout(resolve, coverWaitMs, null))]);
  if (!covers) return;
  for (const game of references) game.coverUrl ||= covers.get(game.igdbId)?.coverUrl ?? null;
}

async function saveCovers(games: TimelineGame[], covers: Map<number, { coverUrl: string | null }>) {
  const client = getDb().$client;
  const found = games.flatMap((game) => {
    const coverUrl = covers.get(game.igdbId)?.coverUrl;
    return coverUrl ? [client.prepare(saveRecoveredCoverQuery).bind(game.id, coverUrl)] : [];
  });
  if (found.length) await client.batch(found);
}
