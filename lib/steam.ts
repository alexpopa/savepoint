import { env } from "cloudflare:workers";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { libraryItems, steamConnections, steamGames, steamMappings } from "../db/schema";
import { getIgdbGame, getSteamCatalogMatches } from "./igdb";
import { steamRequest, SteamError } from "./steam-api";
import { acquireSteamLock, attachSteamGame, importSteamGame, recentSteamCount, recentSteamGames, readySteamGames, saveSteamGame, setSteamMatch, steamMatchCounts } from "./steam-queries";
import { defaultSteamPlatform, steamPlatforms, steamPlatformIds } from "./steam-types";
import type { SteamState } from "./steam-types";
import type { CatalogGame } from "./game-types";

type Connection = typeof steamConnections.$inferSelect;
export const steamConfigured = () => Boolean(env.STEAM_API_KEY);
export const steamPageSize = 30;

export async function getSteamState(userId: string, page = 0, search = "", view = "all"): Promise<SteamState> {
  const db = getDb();
  const [connection] = await db.select().from(steamConnections).where(eq(steamConnections.userId, userId));
  if (!connection) return { configured: steamConfigured(), connection: null, games: [], recent: null, total: 0, pending: 0, ready: 0, review: 0, imported: 0, page: 0 };
  const scope = eq(steamGames.connectionId, connection.connectionId);
  const desktop = sql`EXISTS (SELECT 1 FROM json_each(${steamGames.gameJson}, '$.platformOptions') p WHERE json_extract(p.value, '$.id') IN (${sql.raw(steamPlatformIds.join(", "))}))`;
  const eligible = and(eq(steamGames.ignored, false), isNull(steamGames.libraryItemId), eq(steamGames.observedAt, connection.syncedAt ?? -1));
  const category = view === "review" ? and(eligible, isNotNull(steamGames.matchedAt), sql`NOT ${desktop}`)
    : view === "ready" ? and(eligible, isNull(steamGames.importedAt), desktop)
    : view === "imported" ? isNotNull(steamGames.libraryItemId) : undefined;
  const filter = and(scope, category, search ? sql`instr(lower(${steamGames.name}), lower(${search})) > 0` : undefined);
  const [counts, pendingRows, matchCounts] = await Promise.all([
    view === "updated" ? db.$client.prepare(recentSteamCount).bind(userId, connection.connectionId, search).all<{ total: number }>().then((result) => result.results) : db.select({ total: sql<number>`count(*)` }).from(steamGames).where(filter),
    db.select({ total: sql<number>`count(*)` }).from(steamGames).where(and(scope, isNull(steamGames.matchedAt), eq(steamGames.ignored, false), eq(steamGames.observedAt, connection.syncedAt ?? -1))),
    db.$client.prepare(steamMatchCounts).bind(userId).first<{ ready: number; review: number; imported: number }>(),
  ]);
  const total = counts[0].total;
  page = Math.min(page, Math.max(0, Math.ceil(total / steamPageSize) - 1));
  const recentIds = view === "updated" ? (await db.$client.prepare(recentSteamGames).bind(userId, connection.connectionId, search, page * steamPageSize).all<{ appId: number }>()).results.map((row) => row.appId) : null;
  const rows = recentIds ? recentIds.length ? await db.select().from(steamGames).where(and(scope, inArray(steamGames.appId, recentIds))) : []
    : await db.select().from(steamGames).where(filter).orderBy(asc(steamGames.name), asc(steamGames.appId)).limit(steamPageSize).offset(page * steamPageSize);
  if (recentIds) { const ranks = new Map(recentIds.map((id, i) => [id, i])); rows.sort((a, b) => ranks.get(a.appId)! - ranks.get(b.appId)!); }
  const games = rows.map((row) => ({ ...row, game: row.gameJson ? JSON.parse(row.gameJson) as CatalogGame : null }));
  const ids = games.flatMap((row) => row.game ? [row.game.igdbId] : []);
  const existing = ids.length ? await db.select({ igdbId: libraryItems.igdbId, platformId: libraryItems.platformId }).from(libraryItems).where(and(eq(libraryItems.userId, userId), inArray(libraryItems.igdbId, ids))) : [];
  return { configured: steamConfigured(), connection: { steamId: connection.steamId, syncedAt: connection.syncedAt, attemptedAt: connection.attemptedAt, activityAt: connection.activityAt, syncError: connection.syncError },
    recent: connection.recentJson ? JSON.parse(connection.recentJson) : null, total, pending: pendingRows[0].total, ready: matchCounts?.ready ?? 0, review: matchCounts?.review ?? 0, imported: matchCounts?.imported ?? 0, page,
    games: games.map((row) => ({ appId: row.appId, name: row.name, playtimeMinutes: row.playtimeMinutes, recentMinutes: row.recentMinutes, lastPlayedAt: row.lastPlayedAt,
      game: row.game, matchedAt: row.matchedAt, ignored: row.ignored, importedAt: row.importedAt, libraryItemId: row.libraryItemId,
      available: row.observedAt === connection.syncedAt, existingPlatforms: existing.filter((copy) => copy.igdbId === row.game?.igdbId).map((copy) => copy.platformId) })) };
}

async function withSteamLock<T>(userId: string, action: (connection: Connection, token: string) => Promise<T>) {
  const db = getDb();
  const token = crypto.randomUUID();
  const now = Date.now();
  const locked = await db.$client.prepare(acquireSteamLock).bind(userId, token, now + 120000, now).all();
  if (!locked.results.length) throw new SteamError("Connect Steam first, or wait for the current operation to finish.", 409);
  const [connection] = await db.select().from(steamConnections).where(and(eq(steamConnections.userId, userId), eq(steamConnections.lockToken, token)));
  if (!connection) throw new SteamError("Your Steam connection changed. Please refresh the page.", 409);
  try {
    const result = await action(connection, token);
    const [active] = await db.select({ id: steamConnections.connectionId }).from(steamConnections).where(lease(connection, token));
    if (!active) throw new SteamError("The Steam connection changed or the operation expired. Please reload the preview.", 409);
    return result;
  }
  finally { await db.update(steamConnections).set({ lockToken: null, lockUntil: null }).where(and(eq(steamConnections.connectionId, connection.connectionId), eq(steamConnections.lockToken, token))); }
}

function lease(connection: Connection, token: string) {
  return and(eq(steamConnections.connectionId, connection.connectionId), eq(steamConnections.lockToken, token), sql`${steamConnections.lockUntil} > ${Date.now()}`);
}

export async function refreshSteam(userId: string) {
  if (!steamConfigured()) throw new SteamError("Steam is not configured yet. Ask the site owner to configure its API key.");
  return withSteamLock(userId, async (connection, token) => {
    const db = getDb();
    const now = Date.now();
    if (connection.attemptedAt && now - connection.attemptedAt < 300000) throw new SteamError("You can refresh Steam every five minutes. Please try again shortly.", 429);
    await db.update(steamConnections).set({ attemptedAt: now }).where(lease(connection, token));
    try {
      const games = await steamRequest("GetOwnedGames", connection.steamId, env.STEAM_API_KEY!);
      // Clear inaccessible activity on a successful library refresh instead of redisplaying stale private data.
      const recent = await steamRequest("GetRecentlyPlayedGames", connection.steamId, env.STEAM_API_KEY!).catch(() => null);
      for (let offset = 0; offset < games.length; offset += 100) {
        const statements = games.slice(offset, offset + 100).map((game) => db.$client.prepare(saveSteamGame).bind(connection.connectionId, token, game.appId, game.name, game.playtimeMinutes, game.recentMinutes, game.lastPlayedAt, now, Date.now()));
        await db.$client.batch(statements);
      }
      const saved = await db.update(steamConnections).set({ syncedAt: now, recentJson: recent ? JSON.stringify(recent) : null, activityAt: recent ? now : null,
        syncError: recent ? null : "Library refreshed. Recent activity is unavailable; check your Steam playtime privacy settings." }).where(lease(connection, token)).returning({ id: steamConnections.connectionId });
      if (!saved.length) throw new SteamError("The refresh expired or the connection changed. Please refresh again.", 409);
    } catch (error) {
      const message = error instanceof SteamError ? error.message : "Steam could not be refreshed. Your RGBoner library is unchanged.";
      await db.update(steamConnections).set({ syncError: message, recentJson: null, activityAt: null }).where(lease(connection, token));
      throw error instanceof SteamError ? error : new SteamError(message);
    }
  });
}

export async function matchSteamGames(userId: string) {
  return withSteamLock(userId, async (connection, token) => {
    const db = getDb();
    const rows = await db.select().from(steamGames).where(and(eq(steamGames.connectionId, connection.connectionId), isNull(steamGames.matchedAt), eq(steamGames.ignored, false), eq(steamGames.observedAt, connection.syncedAt ?? -1))).limit(40);
    if (!rows.length) return;
    const now = Date.now();
    const cached = await db.select().from(steamMappings).where(inArray(steamMappings.appId, rows.map((row) => row.appId)));
    const results = new Map(cached.filter((row) => row.checkedAt > now - 7 * 86400000).map((row) => [row.appId, JSON.parse(row.candidatesJson) as CatalogGame[]]));
    const missing = rows.filter((row) => !results.has(row.appId));
    if (missing.length) {
      const matches = await getSteamCatalogMatches(missing.map((row) => row.appId));
      for (const [appId, candidates] of matches) {
        results.set(appId, candidates);
        await db.insert(steamMappings).values({ appId, candidatesJson: JSON.stringify(candidates), checkedAt: now }).onConflictDoUpdate({ target: steamMappings.appId, set: { candidatesJson: JSON.stringify(candidates), checkedAt: now } });
      }
    }
    const statements = rows.map((row) => {
      const candidates = results.get(row.appId) ?? [];
      const game = candidates.length === 1 ? candidates[0] : null;
      return db.$client.prepare(`UPDATE steam_games SET game_json = ?, matched_at = ?, ignored = 0 WHERE connection_id = ? AND app_id = ? AND matched_at IS NULL
        AND EXISTS (SELECT 1 FROM steam_connections WHERE connection_id = ? AND lock_token = ? AND lock_until > ?)`)
        .bind(game ? JSON.stringify(game) : null, now, connection.connectionId, row.appId, connection.connectionId, token, Date.now());
    });
    await db.$client.batch(statements);
  });
}

export async function chooseSteamMatch(userId: string, appId: number, igdbId: number) {
  return withSteamLock(userId, async (connection, token) => {
    const db = getDb();
    const [row] = await db.select().from(steamGames).where(and(eq(steamGames.connectionId, connection.connectionId), eq(steamGames.appId, appId)));
    if (!row || row.libraryItemId) throw new SteamError("Choose an unimported Steam game to match.", 409);
    const game = await getIgdbGame(igdbId);
    if (!game || !steamPlatforms(game).length) throw new SteamError("Choose an IGDB game with a supported PC or VR platform.", 400);
    await db.$client.prepare(setSteamMatch).bind(JSON.stringify(game), Date.now(), connection.connectionId, appId, token).run();
  });
}

export async function resolveSteamGame(userId: string, appId: number, igdbId?: number) {
  return withSteamLock(userId, async (connection, token) => {
    const db = getDb();
    const [row] = await db.select().from(steamGames).where(and(eq(steamGames.connectionId, connection.connectionId), eq(steamGames.appId, appId)));
    if (!row || row.observedAt !== connection.syncedAt) throw new SteamError("Refresh your Steam library before adding this game.", 409);
    if (row.libraryItemId) {
      if (igdbId && JSON.parse(row.gameJson ?? "null")?.igdbId !== igdbId) throw new SteamError("This Steam game is already imported.", 409);
      return;
    }
    const game = igdbId ? await getIgdbGame(igdbId) : row.gameJson ? JSON.parse(row.gameJson) as CatalogGame : null;
    if (!game || !steamPlatforms(game).length) throw new SteamError("Choose a game with a supported PC or VR platform.", 400);
    const existing = await db.select({ platformId: libraryItems.platformId }).from(libraryItems).where(and(eq(libraryItems.userId, userId), eq(libraryItems.igdbId, game.igdbId)));
    const platform = steamPlatforms(game).find((p) => p.id === defaultSteamPlatform(game, existing.map((copy) => copy.platformId)))!;
    const now = Date.now();
    // Matching, creating the copy, and linking the source succeed or roll back together.
    await db.$client.batch([
      db.$client.prepare(setSteamMatch).bind(JSON.stringify(game), now, connection.connectionId, appId, token),
      db.$client.prepare(importSteamGame).bind(connection.connectionId, token, appId, game.igdbId, game.name, game.coverUrl, game.releaseYear, JSON.stringify(game.platforms), platform.id, platform.name, now),
      db.$client.prepare(attachSteamGame).bind(connection.connectionId, token, appId, game.igdbId, platform.id, now),
    ]);
  });
}

export async function ignoreSteamGame(userId: string, appId: number, ignored: boolean) {
  return withSteamLock(userId, async (connection) => {
    await getDb().update(steamGames).set({ ignored }).where(and(eq(steamGames.connectionId, connection.connectionId), eq(steamGames.appId, appId)));
  });
}

async function writeSteamImports(connection: Connection, token: string, selections: { appId: number; platformId: number }[]) {
  if (!selections.length) return;
  const db = getDb();
  const rows = await db.select().from(steamGames).where(and(eq(steamGames.connectionId, connection.connectionId), inArray(steamGames.appId, selections.map((choice) => choice.appId))));
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const choice of selections) {
    const row = rows.find((game) => game.appId === choice.appId);
    if (!row?.gameJson || row.ignored || row.observedAt !== connection.syncedAt) throw new SteamError("Refresh and match the selected Steam games before importing.", 409);
    if (row.libraryItemId) continue;
    const game = JSON.parse(row.gameJson) as CatalogGame;
    const platform = steamPlatforms(game).find((entry) => entry.id === choice.platformId);
    if (!platform) throw new SteamError("Choose a supported platform for every selected game.", 400);
    statements.push(db.$client.prepare(importSteamGame).bind(connection.connectionId, token, row.appId, game.igdbId, game.name, game.coverUrl, game.releaseYear, JSON.stringify(game.platforms), platform.id, platform.name, now));
    statements.push(db.$client.prepare(attachSteamGame).bind(connection.connectionId, token, row.appId, game.igdbId, platform.id, now));
  }
  if (statements.length) await db.$client.batch(statements);
}

export async function importSteamGames(userId: string, selections: { appId: number; platformId: number }[]) {
  return withSteamLock(userId, (connection, token) => writeSteamImports(connection, token, selections));
}

export async function importMatchedSteamBatch(userId: string, steamId: string, syncedAt: number) {
  return withSteamLock(userId, async (connection, token) => {
    if (connection.steamId !== steamId || connection.syncedAt !== syncedAt) throw new SteamError("Your Steam library changed. Review it before continuing the import.", 409);
    const db = getDb();
    const { results } = await db.$client.prepare(readySteamGames).bind(connection.connectionId).all<{ app_id: number; game_json: string }>();
    const games = results.map((row) => ({ appId: row.app_id, game: JSON.parse(row.game_json) as CatalogGame }));
    if (!games.length) return;
    const existing = await db.select({ igdbId: libraryItems.igdbId, platformId: libraryItems.platformId }).from(libraryItems)
      .where(and(eq(libraryItems.userId, userId), inArray(libraryItems.igdbId, games.map((row) => row.game.igdbId))));
    await writeSteamImports(connection, token, games.map(({ appId, game }) => ({ appId,
      platformId: defaultSteamPlatform(game, existing.filter((row) => row.igdbId === game.igdbId).map((row) => row.platformId)) })));
  });
}

export async function disconnectSteam(userId: string) {
  const db = getDb();
  // Invalidate pending callbacks as well as active syncs. Imported RGBoner copies stay put.
  await db.$client.batch([
    db.$client.prepare("DELETE FROM steam_link_states WHERE user_id = ?").bind(userId),
    db.$client.prepare("DELETE FROM steam_connections WHERE user_id = ?").bind(userId),
  ]);
}
