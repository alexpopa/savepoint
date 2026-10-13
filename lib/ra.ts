import { env } from "cloudflare:workers";
import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../db";
import { countPlaytimeOffers, applyPlaytimeOffers } from "./playtime-sync";
import { libraryItems, raConnections, raGames, raLinkCodes, raMappings } from "../db/schema";
import { getIgdbGame, getRaCatalogMatches } from "./igdb";
import {
  fetchCompletionProgress, fetchGameProgress, fetchRaAwards, fetchRaProfile, fetchRecentlyPlayed, fetchSubsetParent, mergeRaGames, RaError, raLinkLifetime,
} from "./ra-api";
import {
  acquireRaLock, attachRaGame, finishRaAchievements, importRaGame, linkRaConnection, playRaGame, raAchievementListQuery, raCounts, raPage, raPageCount, raShowcaseQuery,
  raShowcaseTotals, readyRaGames, removeRaCopies, saveRaAchievement, saveRaGame, saveRaUnlock, setRaMatch, staleRaAchievements, type RaView,
} from "./ra-queries";
import { defaultRaPlatform, raConsolePlatforms, raPlatforms, raSubset } from "./ra-types";
import type { RaAchievement, RaShowcaseGame, RaShowcaseTotals, RaState } from "./ra-types";
import type { CatalogGame } from "./game-types";

type Connection = typeof raConnections.$inferSelect;
export const raConfigured = () => Boolean(env.RA_API_KEY);
export const raPageSize = 30;
const notConfigured = "RetroAchievements is not configured yet. Ask the site owner to add the RetroAchievements API key.";
// A subset whose main game is missing from the player's list needs one request to find it; cap them per refresh.
const parentLookupsPerRefresh = 20;
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function apiKey() {
  if (!raConfigured()) throw new RaError(notConfigured);
  return env.RA_API_KEY!;
}

export async function getRaState(userId: string, page = 0, search = "", view: RaView = "all"): Promise<RaState> {
  const db = getDb();
  const [connection] = await db.select().from(raConnections).where(eq(raConnections.userId, userId));
  const empty = { games: [], total: 0, pending: 0, ready: 0, unresolved: 0, imported: 0, achievementsPending: 0, page: 0 };
  if (!connection) {
    const [link] = await db.select().from(raLinkCodes).where(and(eq(raLinkCodes.userId, userId), gt(raLinkCodes.expiresAt, Date.now())));
    return { configured: raConfigured(), link: link ? { username: link.username, code: link.code, expiresAt: link.expiresAt } : null, connection: null, ...empty };
  }
  const [totals, counts] = await Promise.all([
    db.$client.prepare(raPageCount(view)).bind(userId, search).first<{ total: number }>(),
    db.$client.prepare(raCounts).bind(userId).first<{ imported: number; ready: number; unresolved: number; pending: number; achievementsPending: number }>(),
  ]);
  const total = totals?.total ?? 0;
  page = Math.min(page, Math.max(0, Math.ceil(total / raPageSize) - 1));
  type Row = { gameId: number; name: string; consoleName: string; imageUrl: string | null; lastPlayedAt: number | null; playSeconds: number | null; earned: number; earnedHardcore: number;
    total: number; completedAt: number | null; completedHardcore: number; gameJson: string | null; matchedAt: number | null; importedAt: number | null; libraryItemId: number | null;
    playingSince: number | null; available: number };
  const { results } = await db.$client.prepare(raPage(view)).bind(userId, search, page * raPageSize).all<Row>();
  const games = results.map(({ gameJson, available, completedHardcore, ...row }) => ({ ...row, game: gameJson ? JSON.parse(gameJson) as CatalogGame : null,
    available: Boolean(available), completedHardcore: Boolean(completedHardcore) }));
  const ids = games.flatMap((row) => row.game ? [row.game.igdbId] : []);
  const existing = ids.length ? await db.select({ igdbId: libraryItems.igdbId, platformId: libraryItems.platformId }).from(libraryItems).where(and(eq(libraryItems.userId, userId), inArray(libraryItems.igdbId, ids))) : [];
  return { configured: raConfigured(), link: null,
    connection: { username: connection.username, syncedAt: connection.syncedAt, attemptedAt: connection.attemptedAt, syncError: connection.syncError, paused: connection.syncPaused, playtimeOffers: await countPlaytimeOffers(userId, "ra") },
    total, page, pending: counts?.pending ?? 0, ready: counts?.ready ?? 0, unresolved: counts?.unresolved ?? 0, imported: counts?.imported ?? 0, achievementsPending: counts?.achievementsPending ?? 0,
    games: games.map((row) => ({ ...row, existingPlatforms: existing.filter((copy) => copy.igdbId === row.game?.igdbId).map((copy) => copy.platformId) })) };
}

// RetroAchievements has no sign-in for other sites yet. Following RA's own guidance, the player proves the account
// is theirs by putting a short code in their RA motto; the code is read back by ULID, which no one else can edit.
export async function startRaLink(userId: string, username: string) {
  const key = apiKey();
  const db = getDb();
  const [connection] = await db.select({ userId: raConnections.userId }).from(raConnections).where(eq(raConnections.userId, userId));
  if (connection) throw new RaError("Disconnect your RetroAchievements account before linking another.", 409);
  const now = Date.now();
  const [recent] = await db.select({ expiresAt: raLinkCodes.expiresAt }).from(raLinkCodes).where(eq(raLinkCodes.userId, userId));
  if (recent && recent.expiresAt > now + raLinkLifetime - 60000) throw new RaError("Please wait a minute before requesting another code.", 429);
  const profile = await fetchRaProfile(username, key);
  const [owner] = await db.select({ userId: raConnections.userId }).from(raConnections).where(eq(raConnections.ulid, profile.ulid));
  if (owner) throw new RaError("That RetroAchievements account is already linked to another RGBoner account.", 409);
  const random = crypto.getRandomValues(new Uint8Array(8));
  const code = `RGB-${[...random].map((value) => codeAlphabet[value % codeAlphabet.length]).join("")}`;
  const values = { userId, ulid: profile.ulid, username: profile.username, code, expiresAt: now + raLinkLifetime, checkedAt: null };
  await db.insert(raLinkCodes).values(values).onConflictDoUpdate({ target: raLinkCodes.userId, set: values });
}

export async function cancelRaLink(userId: string) {
  await getDb().delete(raLinkCodes).where(eq(raLinkCodes.userId, userId));
}

export async function verifyRaLink(userId: string) {
  const key = apiKey();
  const db = getDb();
  const now = Date.now();
  // One motto check every five seconds per player keeps repeated clicks off the shared API key.
  const [link] = await db.update(raLinkCodes).set({ checkedAt: now })
    .where(and(eq(raLinkCodes.userId, userId), gt(raLinkCodes.expiresAt, now), or(isNull(raLinkCodes.checkedAt), lt(raLinkCodes.checkedAt, now - 5000)))).returning();
  if (!link) {
    const [pending] = await db.select({ expiresAt: raLinkCodes.expiresAt }).from(raLinkCodes).where(eq(raLinkCodes.userId, userId));
    if (pending && pending.expiresAt > now) throw new RaError("Please wait a few seconds before checking again.", 429);
    throw new RaError("That code expired. Enter your username again to get a new one.", 409);
  }
  const profile = await fetchRaProfile(link.ulid, key);
  if (!profile.motto.toUpperCase().includes(link.code)) throw new RaError(`We couldn’t find ${link.code} in ${profile.username}’s motto yet. Save it on RetroAchievements, then check again.`, 409);
  const saved = await db.$client.prepare(linkRaConnection).bind(userId, crypto.randomUUID(), profile.ulid, profile.username, now).run();
  if (!saved.meta.changes) throw new RaError("That RetroAchievements account is already linked to another RGBoner account.", 409);
  await db.delete(raLinkCodes).where(eq(raLinkCodes.userId, userId));
}

async function withRaLock<T>(userId: string, action: (connection: Connection, token: string) => Promise<T>) {
  const db = getDb();
  const token = crypto.randomUUID();
  const now = Date.now();
  const locked = await db.$client.prepare(acquireRaLock).bind(userId, token, now + 120000, now).all();
  if (!locked.results.length) throw new RaError("Connect RetroAchievements first, or wait for the current operation to finish.", 409);
  const [connection] = await db.select().from(raConnections).where(and(eq(raConnections.userId, userId), eq(raConnections.lockToken, token)));
  if (!connection) throw new RaError("Your RetroAchievements connection changed. Please refresh the page.", 409);
  try { return await action(connection, token); }
  finally { await db.update(raConnections).set({ lockToken: null, lockUntil: null }).where(and(eq(raConnections.connectionId, connection.connectionId), eq(raConnections.lockToken, token))); }
}

export async function refreshRa(userId: string) {
  const key = apiKey();
  return withRaLock(userId, async (connection, token) => {
    const db = getDb();
    const now = Date.now();
    if (connection.attemptedAt && now - connection.attemptedAt < 300000) throw new RaError("You can refresh RetroAchievements every five minutes. Please try again shortly.", 429);
    await db.update(raConnections).set({ attemptedAt: now }).where(and(eq(raConnections.connectionId, connection.connectionId), eq(raConnections.lockToken, token)));
    try {
      const profile = await fetchRaProfile(connection.ulid, key);
      if (profile.ulid !== connection.ulid) throw new RaError("RetroAchievements returned a different account. Disconnect RetroAchievements and connect it again.", 409);
      const progress = await fetchCompletionProgress(connection.ulid, key);
      const awards = await fetchRaAwards(connection.ulid, key);
      const recent = await fetchRecentlyPlayed(connection.ulid, key);
      // Subsets already placed under a saved main game need no new lookup.
      const parents = new Map<number, number>();
      for (const row of await db.select({ gameId: raGames.gameId, subsetIdsJson: raGames.subsetIdsJson }).from(raGames).where(eq(raGames.connectionId, connection.connectionId)))
        for (const subsetId of JSON.parse(row.subsetIdsJson) as number[]) parents.set(subsetId, row.gameId);
      let merged = mergeRaGames(progress, awards, recent, parents);
      if (merged.unplaced.length) {
        for (const subsetId of merged.unplaced.slice(0, parentLookupsPerRefresh)) {
          const parentId = await fetchSubsetParent(subsetId, key);
          if (parentId) parents.set(subsetId, parentId);
        }
        merged = mergeRaGames(progress, awards, recent, parents);
      }
      for (let offset = 0; offset < merged.games.length; offset += 100) {
        await db.$client.batch(merged.games.slice(offset, offset + 100).map((game) => db.$client.prepare(saveRaGame).bind(connection.connectionId, token, game.gameId,
          JSON.stringify(game.subsetIds), game.name, game.consoleId, game.consoleName, game.imageUrl, game.earned, game.earnedHardcore, game.total, game.lastPlayedAt, now,
          game.completedAt, game.completedHardcore ? 1 : 0, Date.now())));
      }
      const saved = await db.update(raConnections).set({ syncedAt: now, syncError: null, syncPaused: false, username: profile.username,
        hardcorePoints: profile.hardcorePoints, softcorePoints: profile.softcorePoints, retroPoints: profile.retroPoints, ...awards.totals })
        .where(and(eq(raConnections.connectionId, connection.connectionId), eq(raConnections.lockToken, token))).returning({ id: raConnections.connectionId });
      if (!saved.length) throw new RaError("The refresh expired or the connection changed. Please refresh again.", 409);
    } catch (error) {
      const message = error instanceof RaError ? error.message : "RetroAchievements could not be refreshed. Your RGBoner library is unchanged.";
      await db.update(raConnections).set({ syncError: message }).where(and(eq(raConnections.connectionId, connection.connectionId), eq(raConnections.lockToken, token)));
      throw error instanceof RaError ? error : new RaError(message);
    }
  });
}

// Saved on the connection so a pause survives leaving or reloading the page.
export async function setRaSyncPaused(userId: string, paused: boolean) {
  await getDb().update(raConnections).set({ syncPaused: paused }).where(eq(raConnections.userId, userId));
}

export async function matchRaGames(userId: string) {
  return withRaLock(userId, async (connection, token) => {
    const db = getDb();
    const rows = await db.select().from(raGames).where(and(eq(raGames.connectionId, connection.connectionId), eq(raGames.observedAt, connection.syncedAt ?? -1), isNull(raGames.matchedAt))).limit(40);
    if (!rows.length) return;
    const now = Date.now();
    const cached = await db.select().from(raMappings).where(inArray(raMappings.gameId, rows.map((row) => row.gameId)));
    const results = new Map(cached.filter((row) => row.checkedAt > now - 7 * 86400000).map((row) => [row.gameId, JSON.parse(row.candidatesJson) as CatalogGame[]]));
    const missing = rows.filter((row) => !results.has(row.gameId));
    if (missing.length) {
      const matches = await getRaCatalogMatches(missing.map((row) => ({ gameId: row.gameId, name: row.name, platforms: raConsolePlatforms[row.consoleId] ?? [] })));
      for (const [gameId, candidates] of matches) {
        results.set(gameId, candidates);
        await db.insert(raMappings).values({ gameId, candidatesJson: JSON.stringify(candidates), checkedAt: now }).onConflictDoUpdate({ target: raMappings.gameId, set: { candidatesJson: JSON.stringify(candidates), checkedAt: now } });
      }
    }
    await db.$client.batch(rows.map((row) => {
      const candidates = results.get(row.gameId) ?? [];
      return db.$client.prepare(setRaMatch).bind(candidates.length === 1 ? JSON.stringify(candidates[0]) : null, now, connection.connectionId, row.gameId, token);
    }));
  });
}

function importStatements(connection: Connection, token: string, gameId: number, game: CatalogGame, platformId: number, now: number, playing: boolean) {
  const client = getDb().$client;
  const platform = raPlatforms(game).find((entry) => entry.id === platformId);
  if (!platform) throw new RaError("Choose a game with a platform RetroAchievements supports.", 400);
  return [
    client.prepare(importRaGame).bind(connection.connectionId, token, gameId, game.igdbId, game.name, game.coverUrl, game.releaseYear, JSON.stringify(game.platforms), platform.id, platform.name, now),
    client.prepare(attachRaGame).bind(connection.connectionId, token, gameId, game.igdbId, platform.id, now),
    ...(playing ? [client.prepare(playRaGame).bind(connection.connectionId, token, gameId, game.igdbId, platform.id, now)] : []),
  ];
}

// Adds one game, optionally choosing its catalog match first and marking it currently playing, in one transaction.
export async function addRaGame(userId: string, gameId: number, igdbId: number | undefined, playing: boolean, platformId?: number) {
  return withRaLock(userId, async (connection, token) => {
    const db = getDb();
    const [row] = await db.select().from(raGames).where(and(eq(raGames.connectionId, connection.connectionId), eq(raGames.gameId, gameId)));
    if (!row || row.observedAt !== connection.syncedAt) throw new RaError("Refresh RetroAchievements before adding this game.", 409);
    const linked = row.gameJson ? JSON.parse(row.gameJson) as CatalogGame : null;
    if (row.libraryItemId && (!igdbId || linked?.igdbId === igdbId)) {
      if (playing) await db.update(libraryItems).set({ playingSince: Date.now() }).where(and(eq(libraryItems.id, row.libraryItemId), eq(libraryItems.userId, userId), isNull(libraryItems.playingSince)));
      return;
    }
    if (row.libraryItemId) throw new RaError("This RetroAchievements game is already in your library.", 409);
    const game = igdbId ? await getIgdbGame(igdbId) : linked;
    if (!game || !raPlatforms(game).length) throw new RaError("Choose a game with a platform RetroAchievements supports.", 400);
    const existing = await db.select({ platformId: libraryItems.platformId }).from(libraryItems).where(and(eq(libraryItems.userId, userId), eq(libraryItems.igdbId, game.igdbId)));
    const now = Date.now();
    await db.$client.batch([
      db.$client.prepare(setRaMatch).bind(JSON.stringify(game), now, connection.connectionId, gameId, token),
      ...importStatements(connection, token, gameId, game, platformId ?? defaultRaPlatform(game, row.consoleId, existing.map((copy) => copy.platformId)), now, playing),
    ]);
  });
}

// Adds up to 30 matched games per request, including games the player removed earlier.
export async function addAllRaGames(userId: string, syncedAt: number) {
  return withRaLock(userId, async (connection, token) => {
    if (connection.syncedAt !== syncedAt) throw new RaError("Your RetroAchievements history changed. Review it before adding everything.", 409);
    const db = getDb();
    const { results } = await db.$client.prepare(readyRaGames).bind(connection.connectionId).all<{ gameId: number; gameJson: string; consoleId: number }>();
    if (!results.length) return;
    const games = results.map((row) => ({ gameId: row.gameId, consoleId: row.consoleId, game: JSON.parse(row.gameJson) as CatalogGame }));
    const existing = await db.select({ igdbId: libraryItems.igdbId, platformId: libraryItems.platformId }).from(libraryItems)
      .where(and(eq(libraryItems.userId, userId), inArray(libraryItems.igdbId, games.map((row) => row.game.igdbId))));
    const now = Date.now();
    await db.$client.batch(games.flatMap(({ gameId, consoleId, game }) => importStatements(connection, token, gameId, game,
      defaultRaPlatform(game, consoleId, existing.filter((copy) => copy.igdbId === game.igdbId).map((copy) => copy.platformId)), now, false)));
  });
}

// Reads full achievement lists for a few added games per request: one request for the main set and one per subset.
export async function syncRaAchievements(userId: string) {
  const key = apiKey();
  return withRaLock(userId, async (connection, token) => {
    const db = getDb();
    const { results } = await db.$client.prepare(staleRaAchievements).bind(connection.connectionId).all<{ id: number; gameId: number; subsetIdsJson: string }>();
    for (const row of results) {
      let playSeconds: number | null = null;
      const statements = [];
      for (const gameId of [row.gameId, ...JSON.parse(row.subsetIdsJson) as number[]]) {
        const list = await fetchGameProgress(gameId, connection.ulid, key);
        // Subsets and their main game share play sessions, so the longest total is the game's playtime.
        playSeconds = Math.max(playSeconds ?? 0, list.playSeconds ?? 0) || null;
        const now = Date.now();
        const setName = gameId === row.gameId ? null : raSubset(list.title)?.name ?? "Subset";
        statements.push(
          ...list.achievements.map((entry) => db.$client.prepare(saveRaAchievement).bind(entry.id, gameId, setName, entry.title, entry.description, entry.badgeUrl, entry.points, entry.displayOrder, entry.rarity, now)),
          ...list.earned.map((entry) => db.$client.prepare(saveRaUnlock).bind(connection.connectionId, token, row.id, entry.id, entry.earnedAt, entry.hardcore ? 1 : 0, now)),
        );
      }
      statements.push(db.$client.prepare(finishRaAchievements).bind(connection.connectionId, token, row.id, playSeconds, Date.now()));
      for (let offset = 0; offset < statements.length; offset += 400) await db.$client.batch(statements.slice(offset, offset + 400));
    }
  });
}


// Removes the library copies RetroAchievements added; ratings and favorites stay with the game, and removed games are ready to add again.
export async function removeRaLibrary(userId: string) {
  return withRaLock(userId, async (connection, token) => {
    await getDb().$client.prepare(removeRaCopies).bind(userId, connection.connectionId, token).run();
  });
}

// Erases RetroAchievements data. Added RGBoner copies stay put.
export async function disconnectRa(userId: string) {
  const db = getDb();
  await db.batch([db.delete(raConnections).where(eq(raConnections.userId, userId)), db.delete(raLinkCodes).where(eq(raLinkCodes.userId, userId))]);
}

export const raShowcaseSize = 12;
export async function getRaShowcase(userId: string): Promise<{ games: RaShowcaseGame[]; totals: RaShowcaseTotals }> {
  const client = getDb().$client;
  const [games, totals] = await client.batch([client.prepare(raShowcaseQuery).bind(userId, raShowcaseSize), client.prepare(raShowcaseTotals).bind(userId)]);
  const summary = (totals.results as RaShowcaseTotals[])[0];
  return { games: (games.results as (Omit<RaShowcaseGame, "completedHardcore"> & { completedHardcore: number })[]).map((row) => ({ ...row, completedHardcore: Boolean(row.completedHardcore) })),
    totals: summary ?? { games: 0, hardcorePoints: 0, softcorePoints: 0, retroPoints: 0, beatenHardcore: 0, beatenSoftcore: 0, mastered: 0, completed: 0 } };
}

export async function getRaAchievementList(userId: string, gameRowId: number): Promise<RaAchievement[]> {
  const { results } = await getDb().$client.prepare(raAchievementListQuery).bind(userId, gameRowId).all<Omit<RaAchievement, "hardcore"> & { hardcore: number }>();
  return results.map((row) => ({ ...row, hardcore: Boolean(row.hardcore) }));
}

// Use all: the library copies RetroAchievements added follow its newer time played again.
export async function applyRaPlaytime(userId: string) {
  await applyPlaytimeOffers(userId, "ra");
}
