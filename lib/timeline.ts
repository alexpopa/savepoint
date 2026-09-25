import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "../db";
import { accounts, challenges, friendships, libraryItems } from "../db/schema";
import { accountDisplayName } from "./social";
import { profilePath } from "./profile-path";
import { recentTimeline, type TimelineChallenge } from "./timeline-items";
import { getIgdbGameCoversForGames } from "./igdb";

export async function getTimeline(viewerId: string) {
  const db = getDb();
  const creator = alias(accounts, "creator");
  const recipient = alias(accounts, "recipient");
  type PersonTable = typeof accounts | typeof creator | typeof recipient;
  const isFriend = (id: PersonTable["userId"]) => sql<boolean>`EXISTS (
    SELECT 1 FROM ${friendships} WHERE ${friendships.status} = 'accepted'
    AND ((${friendships.userLow} = ${viewerId} AND ${friendships.userHigh} = ${id})
      OR (${friendships.userHigh} = ${viewerId} AND ${friendships.userLow} = ${id})))`;
  const visible = (person: PersonTable) => or(eq(person.userId, viewerId), eq(person.isPublic, true), isFriend(person.userId));
  const verified = (person: PersonTable) => and(isNotNull(person.passwordHash), isNotNull(person.emailVerifiedAt));
  const [games, challengeRows] = await Promise.all([
    db.select({ game: libraryItems, person: accounts }).from(libraryItems)
      .innerJoin(accounts, eq(libraryItems.userId, accounts.userId))
      .where(and(isFriend(accounts.userId), verified(accounts))),
    db.select({ challenge: challenges, creator, recipient }).from(challenges)
      .innerJoin(creator, eq(challenges.creatorId, creator.userId))
      .innerJoin(recipient, eq(challenges.recipientId, recipient.userId))
      .where(and(isNotNull(challenges.timelineAt), isNull(challenges.declinedAt),
        or(isFriend(creator.userId), isFriend(recipient.userId)),
        visible(creator), visible(recipient), verified(creator), verified(recipient))),
  ]);
  const person = (row: typeof accounts.$inferSelect) => ({ id: row.userId, name: accountDisplayName(row), href: profilePath(row) });
  const items: TimelineChallenge[] = challengeRows.map(({ challenge: row, creator, recipient }) => ({
    kind: "challenge", key: `challenge:${row.id}`, at: row.timelineAt!, createdAt: row.createdAt,
    title: row.title, gameName: row.gameName, coverUrl: row.gameCoverUrl,
    creator: person(creator), recipient: person(recipient),
    state: row.recipientConfirmed ? row.creatorConfirmed ? "completed" : "claimed" : "pending",
  }));
  const timeline = recentTimeline(games.map(({ game, person: owner }) => ({
    id: game.id, name: game.name, platformName: game.platformName, coverUrl: game.coverUrl,
    addedAt: game.addedAt, person: person(owner),
  })), items);
  // Recover legacy artwork only for the initial visible covers, keeping imports cheap.
  const visibleIds = new Set(timeline.flatMap((item) => item.kind === "library" ? item.games.slice(0, 4).filter((game) => !game.coverUrl).map((game) => game.id) : []));
  if (visibleIds.size) {
    try {
      const references = games.filter(({ game }) => visibleIds.has(game.id)).map(({ game }) => game);
      const covers = await getIgdbGameCoversForGames(references);
      const byRow = new Map(references.map((game) => [game.id, covers.get(game.igdbId)?.coverUrl]));
      for (const item of timeline) if (item.kind === "library") {
        for (const game of item.games) game.coverUrl ||= byRow.get(game.id) ?? null;
      }
    } catch {
      // Artwork availability must never hide friend activity.
    }
  }
  return timeline;
}
