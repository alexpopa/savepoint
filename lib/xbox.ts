import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { libraryItems, xboxConnections, xboxMappings, xboxTitles } from "../db/schema";
import { getIgdbGame, getXboxCatalogMatches } from "./igdb";
import { authorizeXbox, fetchAchievements, fetchTitleHistory, refreshMicrosoftToken, XboxError, type XboxAuth } from "./xbox-api";
import { openToken, sealToken } from "./xbox-crypto";
import {
  acquireXboxLock, attachXboxGame, finishXboxAchievements, importXboxGame, playXboxGame, readyXboxGames, removeXboxCopies, saveXboxAchievement, saveXboxTitle, saveXboxToken,
  saveXboxUnlock, setXboxMatch, staleXboxAchievements, xboxAchievementListQuery, xboxCounts, xboxPage, xboxPageCount, xboxShowcaseQuery, xboxShowcaseTotals, type XboxView,
} from "./xbox-queries";
import { defaultXboxPlatform, devicePlatformIds, xboxPlatforms } from "./xbox-types";
import type { XboxAchievement, XboxShowcaseGame, XboxState } from "./xbox-types";
import type { CatalogGame } from "./game-types";

type Connection = typeof xboxConnections.$inferSelect;
export type XboxTokens = { refreshToken: string; xsts: XboxAuth | null };
export const xboxConfigured = () => Boolean(env.XBOX_CLIENT_ID && env.XBOX_CLIENT_SECRET && env.XBOX_TOKEN_KEY);
export const xboxPageSize = 30;
const notConfigured = "Xbox is not configured yet. Ask the site owner to configure Microsoft sign-in.";

export async function getXboxState(userId: string, page = 0, search = "", view: XboxView = "all"): Promise<XboxState> {
  const db = getDb();
  const [connection] = await db.select().from(xboxConnections).where(eq(xboxConnections.userId, userId));
  const empty = { games: [], total: 0, pending: 0, ready: 0, unresolved: 0, imported: 0, achievementsPending: 0, page: 0 };
  if (!connection) return { configured: xboxConfigured(), connection: null, ...empty };
  const [totals, counts] = await Promise.all([
    db.$client.prepare(xboxPageCount(view)).bind(userId, search).first<{ total: number }>(),
    db.$client.prepare(xboxCounts).bind(userId).first<{ imported: number; ready: number; unresolved: number; pending: number; achievementsPending: number }>(),
  ]);
  const total = totals?.total ?? 0;
  page = Math.min(page, Math.max(0, Math.ceil(total / xboxPageSize) - 1));
  type Row = { titleId: number; name: string; imageUrl: string | null; devicesJson: string; lastPlayedAt: number | null; currentAchievements: number; totalAchievements: number;
    currentGamerscore: number; totalGamerscore: number; gameJson: string | null; matchedAt: number | null; importedAt: number | null; libraryItemId: number | null; playingSince: number | null; available: number };
  const { results } = await db.$client.prepare(xboxPage(view)).bind(userId, search, page * xboxPageSize).all<Row>();
  const games = results.map(({ devicesJson, gameJson, available, ...row }) => ({ ...row, devices: JSON.parse(devicesJson) as string[], game: gameJson ? JSON.parse(gameJson) as CatalogGame : null, available: Boolean(available) }));
  const ids = games.flatMap((row) => row.game ? [row.game.igdbId] : []);
  const existing = ids.length ? await db.select({ igdbId: libraryItems.igdbId, platformId: libraryItems.platformId }).from(libraryItems).where(and(eq(libraryItems.userId, userId), inArray(libraryItems.igdbId, ids))) : [];
  return { configured: xboxConfigured(), connection: { gamertag: connection.gamertag, syncedAt: connection.syncedAt, attemptedAt: connection.attemptedAt, syncError: connection.syncError },
    total, page, pending: counts?.pending ?? 0, ready: counts?.ready ?? 0, unresolved: counts?.unresolved ?? 0, imported: counts?.imported ?? 0, achievementsPending: counts?.achievementsPending ?? 0,
    games: games.map((row) => ({ ...row, existingPlatforms: existing.filter((copy) => copy.igdbId === row.game?.igdbId).map((copy) => copy.platformId) })) };
}

async function withXboxLock<T>(userId: string, action: (connection: Connection, token: string) => Promise<T>) {
  const db = getDb();
  const token = crypto.randomUUID();
  const now = Date.now();
  const locked = await db.$client.prepare(acquireXboxLock).bind(userId, token, now + 120000, now).all();
  if (!locked.results.length) throw new XboxError("Connect Xbox first, or wait for the current operation to finish.", 409);
  const [connection] = await db.select().from(xboxConnections).where(and(eq(xboxConnections.userId, userId), eq(xboxConnections.lockToken, token)));
  if (!connection) throw new XboxError("Your Xbox connection changed. Please refresh the page.", 409);
  try { return await action(connection, token); }
  finally { await db.update(xboxConnections).set({ lockToken: null, lockUntil: null }).where(and(eq(xboxConnections.connectionId, connection.connectionId), eq(xboxConnections.lockToken, token))); }
}

// Reuse the cached Xbox Live token while it is fresh; otherwise redeem the rotating Microsoft refresh token and save both.
async function xboxAuth(connection: Connection, token: string) {
  if (!xboxConfigured()) throw new XboxError(notConfigured);
  let tokens: XboxTokens;
  try { tokens = await openToken<XboxTokens>(connection.tokenCipher, env.XBOX_TOKEN_KEY!, connection.connectionId); }
  catch { throw new XboxError("Your Xbox sign-in can no longer be read. Disconnect Xbox and connect it again.", 409); }
  if (tokens.xsts && tokens.xsts.expiresAt > Date.now() + 10 * 60000) return tokens.xsts;
  const microsoft = await refreshMicrosoftToken(env.XBOX_CLIENT_ID!, env.XBOX_CLIENT_SECRET!, tokens.refreshToken);
  const xsts = await authorizeXbox(microsoft.accessToken);
  // Rotation invalidates the old refresh token, so save the new one even if the identity check below fails.
  const sealed = await sealToken({ refreshToken: microsoft.refreshToken, xsts: xsts.xuid === connection.xuid ? xsts : null } satisfies XboxTokens, env.XBOX_TOKEN_KEY!, connection.connectionId);
  const saved = await getDb().$client.prepare(saveXboxToken).bind(connection.connectionId, token, sealed, Date.now()).run();
  if (!saved.meta.changes) throw new XboxError("The Xbox operation expired. Please try again.", 409);
  if (xsts.xuid !== connection.xuid) throw new XboxError("Microsoft signed in a different Xbox profile. Disconnect Xbox and connect it again.", 409);
  return xsts;
}

export async function refreshXbox(userId: string) {
  if (!xboxConfigured()) throw new XboxError(notConfigured);
  return withXboxLock(userId, async (connection, token) => {
    const db = getDb();
    const now = Date.now();
    if (connection.attemptedAt && now - connection.attemptedAt < 300000) throw new XboxError("You can refresh Xbox every five minutes. Please try again shortly.", 429);
    await db.update(xboxConnections).set({ attemptedAt: now }).where(and(eq(xboxConnections.connectionId, connection.connectionId), eq(xboxConnections.lockToken, token)));
    try {
      const auth = await xboxAuth(connection, token);
      const titles = await fetchTitleHistory(auth);
      for (let offset = 0; offset < titles.length; offset += 100) {
        await db.$client.batch(titles.slice(offset, offset + 100).map((title) => db.$client.prepare(saveXboxTitle).bind(connection.connectionId, token, title.titleId, title.name, title.imageUrl,
          title.productId, JSON.stringify(title.devices), title.lastPlayedAt, title.currentAchievements, title.totalAchievements, title.currentGamerscore, title.totalGamerscore,
          title.achievementVersion, now, Date.now())));
      }
      const saved = await db.update(xboxConnections).set({ syncedAt: now, syncError: null })
        .where(and(eq(xboxConnections.connectionId, connection.connectionId), eq(xboxConnections.lockToken, token))).returning({ id: xboxConnections.connectionId });
      if (!saved.length) throw new XboxError("The refresh expired or the connection changed. Please refresh again.", 409);
    } catch (error) {
      const message = error instanceof XboxError ? error.message : "Xbox could not be refreshed. Your RGBoner library is unchanged.";
      await db.update(xboxConnections).set({ syncError: message }).where(and(eq(xboxConnections.connectionId, connection.connectionId), eq(xboxConnections.lockToken, token)));
      throw error instanceof XboxError ? error : new XboxError(message);
    }
  });
}

export async function matchXboxGames(userId: string) {
  return withXboxLock(userId, async (connection, token) => {
    const db = getDb();
    const rows = await db.select().from(xboxTitles).where(and(eq(xboxTitles.connectionId, connection.connectionId), eq(xboxTitles.observedAt, connection.syncedAt ?? -1), isNull(xboxTitles.matchedAt))).limit(40);
    if (!rows.length) return;
    const now = Date.now();
    const cached = await db.select().from(xboxMappings).where(inArray(xboxMappings.titleId, rows.map((row) => row.titleId)));
    const results = new Map(cached.filter((row) => row.checkedAt > now - 7 * 86400000).map((row) => [row.titleId, JSON.parse(row.candidatesJson) as CatalogGame[]]));
    const missing = rows.filter((row) => !results.has(row.titleId));
    if (missing.length) {
      const matches = await getXboxCatalogMatches(missing.map((row) => ({ titleId: row.titleId, name: row.name, productId: row.productId, devicePlatforms: devicePlatformIds(JSON.parse(row.devicesJson)) })));
      for (const [titleId, candidates] of matches) {
        results.set(titleId, candidates);
        await db.insert(xboxMappings).values({ titleId, candidatesJson: JSON.stringify(candidates), checkedAt: now }).onConflictDoUpdate({ target: xboxMappings.titleId, set: { candidatesJson: JSON.stringify(candidates), checkedAt: now } });
      }
    }
    await db.$client.batch(rows.map((row) => {
      const candidates = results.get(row.titleId) ?? [];
      return db.$client.prepare(setXboxMatch).bind(candidates.length === 1 ? JSON.stringify(candidates[0]) : null, now, connection.connectionId, row.titleId, token);
    }));
  });
}

function importStatements(connection: Connection, token: string, titleId: number, game: CatalogGame, platformId: number, now: number, playing: boolean) {
  const client = getDb().$client;
  const platform = xboxPlatforms(game).find((entry) => entry.id === platformId);
  if (!platform) throw new XboxError("Choose a game with an Xbox or PC platform.", 400);
  return [
    client.prepare(importXboxGame).bind(connection.connectionId, token, titleId, game.igdbId, game.name, game.coverUrl, game.releaseYear, JSON.stringify(game.platforms), platform.id, platform.name, now),
    client.prepare(attachXboxGame).bind(connection.connectionId, token, titleId, game.igdbId, platform.id, now),
    ...(playing ? [client.prepare(playXboxGame).bind(connection.connectionId, token, titleId, game.igdbId, platform.id, now)] : []),
  ];
}

// Adds one title, optionally choosing its catalog match first and marking it currently playing, in one transaction.
export async function addXboxGame(userId: string, titleId: number, igdbId: number | undefined, playing: boolean, platformId?: number) {
  return withXboxLock(userId, async (connection, token) => {
    const db = getDb();
    const [row] = await db.select().from(xboxTitles).where(and(eq(xboxTitles.connectionId, connection.connectionId), eq(xboxTitles.titleId, titleId)));
    if (!row || row.observedAt !== connection.syncedAt) throw new XboxError("Refresh Xbox before adding this game.", 409);
    const linked = row.gameJson ? JSON.parse(row.gameJson) as CatalogGame : null;
    if (row.libraryItemId && (!igdbId || linked?.igdbId === igdbId)) {
      if (playing) await db.update(libraryItems).set({ playingSince: Date.now() }).where(and(eq(libraryItems.id, row.libraryItemId), eq(libraryItems.userId, userId), isNull(libraryItems.playingSince)));
      return;
    }
    if (row.libraryItemId) throw new XboxError("This Xbox game is already in your library.", 409);
    const game = igdbId ? await getIgdbGame(igdbId) : linked;
    if (!game || !xboxPlatforms(game).length) throw new XboxError("Choose a game with an Xbox or PC platform.", 400);
    const existing = await db.select({ platformId: libraryItems.platformId }).from(libraryItems).where(and(eq(libraryItems.userId, userId), eq(libraryItems.igdbId, game.igdbId)));
    const now = Date.now();
    await db.$client.batch([
      db.$client.prepare(setXboxMatch).bind(JSON.stringify(game), now, connection.connectionId, titleId, token),
      ...importStatements(connection, token, titleId, game, platformId ?? defaultXboxPlatform(game, JSON.parse(row.devicesJson), existing.map((copy) => copy.platformId)), now, playing),
    ]);
  });
}

// Adds up to 30 matched titles per request, including games the player removed earlier.
export async function addAllXboxGames(userId: string, syncedAt: number) {
  return withXboxLock(userId, async (connection, token) => {
    if (connection.syncedAt !== syncedAt) throw new XboxError("Your Xbox history changed. Review it before adding everything.", 409);
    const db = getDb();
    const { results } = await db.$client.prepare(readyXboxGames).bind(connection.connectionId).all<{ titleId: number; gameJson: string; devicesJson: string }>();
    if (!results.length) return;
    const games = results.map((row) => ({ titleId: row.titleId, devices: JSON.parse(row.devicesJson) as string[], game: JSON.parse(row.gameJson) as CatalogGame }));
    const existing = await db.select({ igdbId: libraryItems.igdbId, platformId: libraryItems.platformId }).from(libraryItems)
      .where(and(eq(libraryItems.userId, userId), inArray(libraryItems.igdbId, games.map((row) => row.game.igdbId))));
    const now = Date.now();
    await db.$client.batch(games.flatMap(({ titleId, devices, game }) => importStatements(connection, token, titleId, game,
      defaultXboxPlatform(game, devices, existing.filter((copy) => copy.igdbId === game.igdbId).map((copy) => copy.platformId)), now, false)));
  });
}

// Reads full achievement lists for a few added titles per request, keeping well under Xbox's per-user rate limits.
export async function syncXboxAchievements(userId: string) {
  return withXboxLock(userId, async (connection, token) => {
    const db = getDb();
    const { results } = await db.$client.prepare(staleXboxAchievements).bind(connection.connectionId).all<{ id: number; titleId: number; achievementVersion: number }>();
    if (!results.length) return;
    const auth = await xboxAuth(connection, token);
    for (const title of results) {
      const list = await fetchAchievements(auth, title.titleId, title.achievementVersion === 1 ? 1 : 2);
      const now = Date.now();
      const statements = [
        ...list.achievements.map((entry) => db.$client.prepare(saveXboxAchievement).bind(title.titleId, entry.id, entry.name, entry.description, entry.iconUrl, entry.gamerscore, entry.isSecret ? 1 : 0, entry.rarity, entry.sortOrder, now)),
        ...list.unlocks.map((unlock) => db.$client.prepare(saveXboxUnlock).bind(connection.connectionId, token, title.id, unlock.id, unlock.unlockedAt, now)),
        db.$client.prepare(finishXboxAchievements).bind(connection.connectionId, token, title.id, list.achievements.length, now),
      ];
      for (let offset = 0; offset < statements.length; offset += 400) await db.$client.batch(statements.slice(offset, offset + 400));
    }
  });
}

// Removes the library copies Xbox added; ratings and favorites stay with the game, and removed games are ready to add again.
export async function removeXboxLibrary(userId: string) {
  return withXboxLock(userId, async (connection, token) => {
    await getDb().$client.prepare(removeXboxCopies).bind(userId, connection.connectionId, token).run();
  });
}

export async function disconnectXbox(userId: string) {
  const db = getDb();
  // Invalidate pending sign-ins as well as active syncs. Added RGBoner copies stay put.
  await db.$client.batch([
    db.$client.prepare("DELETE FROM xbox_link_states WHERE user_id = ?").bind(userId),
    db.$client.prepare("DELETE FROM xbox_connections WHERE user_id = ?").bind(userId),
  ]);
}

export const xboxShowcaseSize = 12;
export async function getXboxShowcase(userId: string) {
  const client = getDb().$client;
  const [games, totals] = await client.batch([client.prepare(xboxShowcaseQuery).bind(userId, xboxShowcaseSize), client.prepare(xboxShowcaseTotals).bind(userId)]);
  const summary = (totals.results as { games: number; gamerscore: number; completed: number }[])[0];
  return { games: games.results as XboxShowcaseGame[], totals: summary ?? { games: 0, gamerscore: 0, completed: 0 } };
}

export async function getXboxAchievementList(userId: string, titleRowId: number): Promise<XboxAchievement[]> {
  const { results } = await getDb().$client.prepare(xboxAchievementListQuery).bind(userId, titleRowId).all<Omit<XboxAchievement, "isSecret"> & { isSecret: number }>();
  return results.map((row) => ({ ...row, isSecret: Boolean(row.isSecret) }));
}
