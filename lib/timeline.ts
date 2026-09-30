import { and, desc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { alias, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import { getDb } from "../db";
import { accounts, challenges, friendships, libraryItems, gameFavorites, gameRatings } from "../db/schema";
import { accountDisplayName } from "./social";
import { profilePath } from "./profile-path";
import { timelinePage, timelinePageSize, type TimelineChallenge, type TimelineCursor, type TimelineItem } from "./timeline-items";
import { getIgdbGameCoversForGames } from "./igdb";
import { hasPermission, type PermissionUser } from "./permissions";

type Floors = Record<string, number>;
const batchedRowLimit = 100;

export async function getTimelinePage(user: PermissionUser, cursor: TimelineCursor | null) {
  const viewerId = user.userId;
  const db = getDb();
  const creator = alias(accounts, "creator");
  const recipient = alias(accounts, "recipient");
  type PersonTable = typeof accounts | typeof creator | typeof recipient;
  const isFriend = (id: PersonTable["userId"]) => sql<boolean>`EXISTS (
    SELECT 1 FROM ${friendships} WHERE ${friendships.status} = 'accepted'
    AND ((${friendships.userLow} = ${viewerId} AND ${friendships.userHigh} = ${id})
      OR (${friendships.userHigh} = ${viewerId} AND ${friendships.userLow} = ${id})))`;
  const visible = (person: PersonTable) => hasPermission(user, false) ? sql`1 = 1` : or(eq(person.userId, viewerId), eq(person.isPublic, true), isFriend(person.userId));
  const verified = (person: PersonTable) => and(isNotNull(person.passwordHash), isNotNull(person.emailVerifiedAt));
  const before = (at: SQLiteColumn) => cursor ? lte(at, cursor.at) : undefined;
  // One JSON parameter keeps the floors under D1's bound-parameter limit however many friends appear.
  const belowFloor = (userId: SQLiteColumn, at: SQLiteColumn, floors: Floors | undefined) => floors && Object.keys(floors).length
    ? sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(floors)}) AS floor WHERE floor.key = ${userId} AND ${at} >= floor.value)` : undefined;
  const person = (row: typeof accounts.$inferSelect) => ({ id: row.userId, name: accountDisplayName(row), href: profilePath(row) });
  const source = <T>(rows: T[], limit: number) => ({ rows, truncated: rows.length === limit });
  const copyEntry = (game: typeof libraryItems.$inferSelect, owner: typeof accounts.$inferSelect) => ({
    person: person(owner), igdbId: game.igdbId, name: game.name, coverUrl: game.coverUrl, releaseYear: game.releaseYear, platformName: game.platformName,
  });
  const friendCopies = (at: SQLiteColumn, limit: number) => db.select({ game: libraryItems, person: accounts }).from(libraryItems)
    .innerJoin(accounts, eq(libraryItems.userId, accounts.userId))
    .where(and(isNotNull(at), before(at), isFriend(accounts.userId), verified(accounts)))
    .orderBy(desc(at), desc(libraryItems.id)).limit(limit);

  // Single entries are read one page at a time; batched rows grow until every shown batch is complete.
  for (let singleLimit = timelinePageSize + 1, batchedLimit = batchedRowLimit; ; singleLimit *= 4, batchedLimit *= 4) {
    const [games, challengeRows, favoriteRows, playingRows, completedRows, ratingRows] = await Promise.all([
      db.select({ game: libraryItems, person: accounts }).from(libraryItems)
        .innerJoin(accounts, eq(libraryItems.userId, accounts.userId))
        .where(and(before(libraryItems.addedAt), belowFloor(libraryItems.userId, libraryItems.addedAt, cursor?.library), isFriend(accounts.userId), verified(accounts)))
        .orderBy(desc(libraryItems.addedAt), desc(libraryItems.id)).limit(batchedLimit),
      db.select({ challenge: challenges, creator, recipient }).from(challenges)
        .innerJoin(creator, eq(challenges.creatorId, creator.userId))
        .innerJoin(recipient, eq(challenges.recipientId, recipient.userId))
        .where(and(isNotNull(challenges.timelineAt), before(challenges.timelineAt), isNull(challenges.declinedAt),
          or(isFriend(creator.userId), isFriend(recipient.userId)),
          visible(creator), visible(recipient), verified(creator), verified(recipient)))
        .orderBy(desc(challenges.timelineAt), desc(challenges.id)).limit(singleLimit),
      db.select({ game: gameFavorites, person: accounts }).from(gameFavorites)
        .innerJoin(accounts, eq(gameFavorites.userId, accounts.userId))
        .where(and(before(gameFavorites.favoritedAt), isFriend(accounts.userId), verified(accounts)))
        .orderBy(desc(gameFavorites.favoritedAt), desc(gameFavorites.id)).limit(singleLimit),
      friendCopies(libraryItems.playingSince, singleLimit),
      friendCopies(libraryItems.completedAt, singleLimit),
      db.select({ game: gameRatings, person: accounts }).from(gameRatings)
        .innerJoin(accounts, eq(gameRatings.userId, accounts.userId))
        .where(and(before(gameRatings.ratedAt), belowFloor(gameRatings.userId, gameRatings.ratedAt, cursor?.ratings), isFriend(accounts.userId), verified(accounts)))
        .orderBy(desc(gameRatings.ratedAt), desc(gameRatings.id)).limit(batchedLimit),
    ]);
    const page = timelinePage({
      games: source(games.map(({ game, person: owner }) => ({
        id: game.id, igdbId: game.igdbId, name: game.name, releaseYear: game.releaseYear, platformName: game.platformName, coverUrl: game.coverUrl,
        addedAt: game.addedAt, person: person(owner),
      })), batchedLimit),
      challenges: source(challengeRows.map(({ challenge: row, creator, recipient }): TimelineChallenge => ({
        kind: "challenge", key: `challenge:${row.id}`, id: row.id, at: row.timelineAt!, createdAt: row.createdAt,
        title: row.title, description: row.description, gameName: row.gameName, coverUrl: row.gameCoverUrl,
        creator: person(creator), recipient: person(recipient),
        state: row.recipientConfirmed ? row.creatorConfirmed ? "completed" : "claimed" : "pending",
      })), singleLimit),
      favorites: source(favoriteRows.map(({ game, person: owner }) => ({
        kind: "favorite" as const, key: `favorite:${game.id}`, at: game.favoritedAt,
        person: person(owner), igdbId: game.igdbId, name: game.name, coverUrl: game.coverUrl, releaseYear: game.releaseYear,
      })), singleLimit),
      playing: source(playingRows.map(({ game, person: owner }) => ({ kind: "playing" as const, key: `playing:${game.id}`, at: game.playingSince!, ...copyEntry(game, owner) })), singleLimit),
      completed: source(completedRows.map(({ game, person: owner }) => ({ kind: "completed" as const, key: `completed:${game.id}`, at: game.completedAt!, ...copyEntry(game, owner) })), singleLimit),
      ratings: source(ratingRows.map(({ game, person: owner }) => ({
        id: game.id, igdbId: game.igdbId, name: game.name, releaseYear: game.releaseYear, coverUrl: game.coverUrl,
        score: game.score, ratedAt: game.ratedAt, person: person(owner),
      })), batchedLimit),
    }, cursor);
    if (!page) continue;
    await recoverCovers(page.items);
    return page;
  }
}

// Recover legacy artwork only for the initial visible covers, keeping imports cheap.
async function recoverCovers(items: TimelineItem[]) {
  const references = items.flatMap((item) => item.kind === "library" ? item.games.slice(0, 4).filter((game) => !game.coverUrl) : []);
  if (!references.length) return;
  try {
    const covers = await getIgdbGameCoversForGames(references);
    for (const game of references) game.coverUrl ||= covers.get(game.igdbId)?.coverUrl ?? null;
  } catch {
    // Artwork availability must never hide friend activity.
  }
}
