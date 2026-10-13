import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { countPlaytimeOffers, applyPlaytimeOffers } from "./playtime-sync";
import { libraryItems, psnConnections, psnMappings, psnTitles } from "../db/schema";
import { getIgdbGame, getPsnCatalogMatches } from "./igdb";
import {
  exchangeNpsso, fetchPlayedTitles, fetchPsnProfile, fetchTitleLinks, fetchTrophies, fetchTrophySummary, fetchTrophyTitles, mergePsnTitles, PsnError, refreshPsnToken, type PsnTokens,
} from "./psn-api";
import { openToken, sealToken } from "./token-crypto";
import {
  acquirePsnLock, adoptPsnTitles, attachPsnGame, dropAdoptedPsnTitles, finishPsnTrophies, importPsnGame, linkPsnConnection, playPsnGame, psnCounts, psnPage, psnPageCount,
  psnShowcaseQuery, psnShowcaseTotals, psnTrophyListQuery, readyPsnGames, reconnectPsnConnection, removePsnCopies, savePsnTitle, savePsnToken, savePsnTrophy, savePsnUnlock,
  setPsnMatch, stalePsnTrophies, type PsnView,
} from "./psn-queries";
import { defaultPsnPlatform, psnPlatforms, sonyPlatformIds } from "./psn-types";
import type { PsnShowcaseGame, PsnShowcaseTotals, PsnState, PsnTrophy, TrophyGrade } from "./psn-types";
import type { CatalogGame } from "./game-types";

type Connection = typeof psnConnections.$inferSelect;
export const psnConfigured = () => Boolean(env.PSN_TOKEN_KEY);
export const psnPageSize = 30;
const notConfigured = "PlayStation is not configured yet. Ask the site owner to add the PlayStation token key.";
// Sony links played titles to trophy lists five at a time; cap the lookups per refresh and continue on the next one.
const linkLookupsPerRefresh = 100;

export async function getPsnState(userId: string, page = 0, search = "", view: PsnView = "all"): Promise<PsnState> {
  const db = getDb();
  const [connection] = await db.select().from(psnConnections).where(eq(psnConnections.userId, userId));
  const empty = { games: [], total: 0, pending: 0, ready: 0, unresolved: 0, imported: 0, trophiesPending: 0, page: 0 };
  if (!connection) return { configured: psnConfigured(), connection: null, ...empty };
  const [totals, counts] = await Promise.all([
    db.$client.prepare(psnPageCount(view)).bind(userId, search).first<{ total: number }>(),
    db.$client.prepare(psnCounts).bind(userId).first<{ imported: number; ready: number; unresolved: number; pending: number; trophiesPending: number }>(),
  ]);
  const total = totals?.total ?? 0;
  page = Math.min(page, Math.max(0, Math.ceil(total / psnPageSize) - 1));
  type Row = { titleKey: string; name: string; imageUrl: string | null; platformsJson: string; lastPlayedAt: number | null; playSeconds: number | null; earnedTrophies: number; totalTrophies: number;
    hasPlatinum: number; platinumEarned: number; gameJson: string | null; matchedAt: number | null; importedAt: number | null; libraryItemId: number | null; playingSince: number | null; available: number };
  const { results } = await db.$client.prepare(psnPage(view)).bind(userId, search, page * psnPageSize).all<Row>();
  const games = results.map(({ platformsJson, gameJson, available, hasPlatinum, platinumEarned, ...row }) => ({ ...row, platforms: JSON.parse(platformsJson) as string[],
    game: gameJson ? JSON.parse(gameJson) as CatalogGame : null, available: Boolean(available), hasPlatinum: Boolean(hasPlatinum), platinumEarned: Boolean(platinumEarned) }));
  const ids = games.flatMap((row) => row.game ? [row.game.igdbId] : []);
  const existing = ids.length ? await db.select({ igdbId: libraryItems.igdbId, platformId: libraryItems.platformId }).from(libraryItems).where(and(eq(libraryItems.userId, userId), inArray(libraryItems.igdbId, ids))) : [];
  return { configured: psnConfigured(),
    connection: { onlineId: connection.onlineId, syncedAt: connection.syncedAt, attemptedAt: connection.attemptedAt, syncError: connection.syncError, paused: connection.syncPaused, playtimeOffers: await countPlaytimeOffers(userId, "psn"), needsReconnect: connection.needsReconnect },
    total, page, pending: counts?.pending ?? 0, ready: counts?.ready ?? 0, unresolved: counts?.unresolved ?? 0, imported: counts?.imported ?? 0, trophiesPending: counts?.trophiesPending ?? 0,
    games: games.map((row) => ({ ...row, existingPlatforms: existing.filter((copy) => copy.igdbId === row.game?.igdbId).map((copy) => copy.platformId) })) };
}

// Connects a new PSN account, or reconnects the same one after its sign-in expired, keeping every saved game and trophy.
export async function connectPsn(userId: string, npsso: string) {
  if (!psnConfigured()) throw new PsnError(notConfigured);
  const db = getDb();
  const tokens = await exchangeNpsso(npsso);
  const profile = await fetchPsnProfile(tokens.accessToken);
  const [connection] = await db.select().from(psnConnections).where(eq(psnConnections.userId, userId));
  if (connection) {
    if (connection.accountId !== profile.accountId) throw new PsnError(`That NPSSO belongs to a different PSN account. Sign in to playstation.com as ${connection.onlineId}, or disconnect PlayStation first.`, 409);
    const sealed = await sealToken(tokens satisfies PsnTokens, env.PSN_TOKEN_KEY!, connection.connectionId);
    await db.$client.prepare(reconnectPsnConnection).bind(userId, profile.accountId, profile.onlineId, sealed).run();
    return;
  }
  const connectionId = crypto.randomUUID();
  const sealed = await sealToken(tokens satisfies PsnTokens, env.PSN_TOKEN_KEY!, connectionId);
  const saved = await db.$client.prepare(linkPsnConnection).bind(userId, connectionId, profile.accountId, profile.onlineId, sealed, Date.now()).run();
  if (!saved.meta.changes) throw new PsnError("That PSN account is already linked to another RGBoner account.", 409);
}

async function withPsnLock<T>(userId: string, action: (connection: Connection, token: string) => Promise<T>) {
  const db = getDb();
  const token = crypto.randomUUID();
  const now = Date.now();
  const locked = await db.$client.prepare(acquirePsnLock).bind(userId, token, now + 120000, now).all();
  if (!locked.results.length) throw new PsnError("Connect PlayStation first, or wait for the current operation to finish.", 409);
  const [connection] = await db.select().from(psnConnections).where(and(eq(psnConnections.userId, userId), eq(psnConnections.lockToken, token)));
  if (!connection) throw new PsnError("Your PlayStation connection changed. Please refresh the page.", 409);
  try { return await action(connection, token); }
  catch (error) {
    // A rejected sign-in pauses sync until the player reconnects; everything saved stays.
    if (error instanceof PsnError && error.reconnect) await db.update(psnConnections).set({ needsReconnect: true, syncPaused: true, syncError: error.message })
      .where(and(eq(psnConnections.connectionId, connection.connectionId), eq(psnConnections.lockToken, token)));
    throw error;
  }
  finally { await db.update(psnConnections).set({ lockToken: null, lockUntil: null }).where(and(eq(psnConnections.connectionId, connection.connectionId), eq(psnConnections.lockToken, token))); }
}

// Reuse the cached access token while it is fresh; otherwise redeem the refresh token and save what Sony returns.
async function psnAccess(connection: Connection, token: string) {
  if (!psnConfigured()) throw new PsnError(notConfigured);
  if (connection.needsReconnect) throw new PsnError("Reconnect PlayStation with a new NPSSO token to continue.", 409);
  let tokens: PsnTokens;
  try { tokens = await openToken<PsnTokens>(connection.tokenCipher, env.PSN_TOKEN_KEY!, connection.connectionId); }
  catch { throw new PsnError("Your PlayStation sign-in can no longer be read. Reconnect PlayStation with a new NPSSO token.", 401, true); }
  if (tokens.expiresAt > Date.now() + 5 * 60000) return tokens.accessToken;
  const fresh = await refreshPsnToken(tokens.refreshToken);
  const sealed = await sealToken(fresh satisfies PsnTokens, env.PSN_TOKEN_KEY!, connection.connectionId);
  const saved = await getDb().$client.prepare(savePsnToken).bind(connection.connectionId, token, sealed, Date.now()).run();
  if (!saved.meta.changes) throw new PsnError("The PlayStation operation expired. Please try again.", 409);
  return fresh.accessToken;
}

export async function refreshPsn(userId: string) {
  if (!psnConfigured()) throw new PsnError(notConfigured);
  return withPsnLock(userId, async (connection, token) => {
    const db = getDb();
    const now = Date.now();
    if (connection.attemptedAt && now - connection.attemptedAt < 300000) throw new PsnError("You can refresh PlayStation every five minutes. Please try again shortly.", 429);
    await db.update(psnConnections).set({ attemptedAt: now }).where(and(eq(psnConnections.connectionId, connection.connectionId), eq(psnConnections.lockToken, token)));
    try {
      const access = await psnAccess(connection, token);
      const summary = await fetchTrophySummary(access);
      if (summary.accountId !== connection.accountId) throw new PsnError("Sony signed in a different PSN account. Disconnect PlayStation and connect it again.", 409);
      const [trophyTitles, played] = [await fetchTrophyTitles(access), await fetchPlayedTitles(access)];
      // Title IDs already placed on a trophy row, or already looked up, need no new request.
      const known = await db.select({ titleIdsJson: psnTitles.titleIdsJson, npCommunicationId: psnTitles.npCommunicationId, linksChecked: psnTitles.linksChecked })
        .from(psnTitles).where(eq(psnTitles.connectionId, connection.connectionId));
      const links = new Map<string, string[]>(), checked = new Set<string>();
      for (const row of known) for (const id of JSON.parse(row.titleIdsJson) as string[]) {
        if (row.npCommunicationId) { links.set(id, [row.npCommunicationId]); checked.add(id); }
        else if (row.linksChecked) checked.add(id);
      }
      const lookups = mergePsnTitles(trophyTitles, played, links, checked).filter((row) => !row.npCommunicationId && !row.linksChecked)
        .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)).flatMap((row) => row.titleIds.filter((id) => !checked.has(id))).slice(0, linkLookupsPerRefresh);
      if (lookups.length) for (const [id, ids] of await fetchTitleLinks(access, lookups)) { links.set(id, ids); checked.add(id); }
      const titles = mergePsnTitles(trophyTitles, played, links, checked);
      for (let offset = 0; offset < titles.length; offset += 100) {
        await db.$client.batch(titles.slice(offset, offset + 100).map((title) => db.$client.prepare(savePsnTitle).bind(connection.connectionId, token, title.titleKey, title.name, title.imageUrl,
          JSON.stringify(title.platforms), title.npCommunicationId, title.npServiceName, title.conceptId, JSON.stringify(title.titleIds), title.linksChecked ? 1 : 0,
          title.lastPlayedAt, title.playSeconds, title.earned.platinum, title.earned.gold, title.earned.silver, title.earned.bronze,
          title.defined.platinum, title.defined.gold, title.defined.silver, title.defined.bronze, title.progress, now, Date.now())));
      }
      await db.$client.batch([db.$client.prepare(adoptPsnTitles).bind(connection.connectionId, token, now), db.$client.prepare(dropAdoptedPsnTitles).bind(connection.connectionId, token, now)]);
      const saved = await db.update(psnConnections).set({ syncedAt: now, syncError: null, syncPaused: false, trophyLevel: summary.level,
        earnedPlatinum: summary.earned.platinum, earnedGold: summary.earned.gold, earnedSilver: summary.earned.silver, earnedBronze: summary.earned.bronze })
        .where(and(eq(psnConnections.connectionId, connection.connectionId), eq(psnConnections.lockToken, token))).returning({ id: psnConnections.connectionId });
      if (!saved.length) throw new PsnError("The refresh expired or the connection changed. Please refresh again.", 409);
    } catch (error) {
      const message = error instanceof PsnError ? error.message : "PlayStation could not be refreshed. Your RGBoner library is unchanged.";
      await db.update(psnConnections).set({ syncError: message }).where(and(eq(psnConnections.connectionId, connection.connectionId), eq(psnConnections.lockToken, token)));
      throw error instanceof PsnError ? error : new PsnError(message);
    }
  });
}

// Saved on the connection so a pause survives leaving or reloading the page.
export async function setPsnSyncPaused(userId: string, paused: boolean) {
  await getDb().update(psnConnections).set({ syncPaused: paused }).where(eq(psnConnections.userId, userId));
}

export async function matchPsnGames(userId: string) {
  return withPsnLock(userId, async (connection, token) => {
    const db = getDb();
    const rows = await db.select().from(psnTitles).where(and(eq(psnTitles.connectionId, connection.connectionId), eq(psnTitles.observedAt, connection.syncedAt ?? -1), isNull(psnTitles.matchedAt))).limit(40);
    if (!rows.length) return;
    const now = Date.now();
    const cached = await db.select().from(psnMappings).where(inArray(psnMappings.titleKey, rows.map((row) => row.titleKey)));
    const results = new Map(cached.filter((row) => row.checkedAt > now - 7 * 86400000).map((row) => [row.titleKey, JSON.parse(row.candidatesJson) as CatalogGame[]]));
    const missing = rows.filter((row) => !results.has(row.titleKey));
    if (missing.length) {
      const matches = await getPsnCatalogMatches(missing.map((row) => ({ titleKey: row.titleKey, name: row.name, conceptId: row.conceptId, titleIds: JSON.parse(row.titleIdsJson) as string[],
        platforms: sonyPlatformIds(JSON.parse(row.platformsJson)) })));
      for (const [titleKey, candidates] of matches) {
        results.set(titleKey, candidates);
        await db.insert(psnMappings).values({ titleKey, candidatesJson: JSON.stringify(candidates), checkedAt: now }).onConflictDoUpdate({ target: psnMappings.titleKey, set: { candidatesJson: JSON.stringify(candidates), checkedAt: now } });
      }
    }
    await db.$client.batch(rows.map((row) => {
      const candidates = results.get(row.titleKey) ?? [];
      return db.$client.prepare(setPsnMatch).bind(candidates.length === 1 ? JSON.stringify(candidates[0]) : null, now, connection.connectionId, row.titleKey, token);
    }));
  });
}

function importStatements(connection: Connection, token: string, titleKey: string, game: CatalogGame, platformId: number, now: number, playing: boolean) {
  const client = getDb().$client;
  const platform = psnPlatforms(game).find((entry) => entry.id === platformId);
  if (!platform) throw new PsnError("Choose a game with a PlayStation platform.", 400);
  return [
    client.prepare(importPsnGame).bind(connection.connectionId, token, titleKey, game.igdbId, game.name, game.coverUrl, game.releaseYear, JSON.stringify(game.platforms), platform.id, platform.name, now),
    client.prepare(attachPsnGame).bind(connection.connectionId, token, titleKey, game.igdbId, platform.id, now),
    ...(playing ? [client.prepare(playPsnGame).bind(connection.connectionId, token, titleKey, game.igdbId, platform.id, now)] : []),
  ];
}

// Adds one title, optionally choosing its catalog match first and marking it currently playing, in one transaction.
export async function addPsnGame(userId: string, titleKey: string, igdbId: number | undefined, playing: boolean, platformId?: number) {
  return withPsnLock(userId, async (connection, token) => {
    const db = getDb();
    const [row] = await db.select().from(psnTitles).where(and(eq(psnTitles.connectionId, connection.connectionId), eq(psnTitles.titleKey, titleKey)));
    if (!row || row.observedAt !== connection.syncedAt) throw new PsnError("Refresh PlayStation before adding this game.", 409);
    const linked = row.gameJson ? JSON.parse(row.gameJson) as CatalogGame : null;
    if (row.libraryItemId && (!igdbId || linked?.igdbId === igdbId)) {
      if (playing) await db.update(libraryItems).set({ playingSince: Date.now() }).where(and(eq(libraryItems.id, row.libraryItemId), eq(libraryItems.userId, userId), isNull(libraryItems.playingSince)));
      return;
    }
    if (row.libraryItemId) throw new PsnError("This PlayStation game is already in your library.", 409);
    const game = igdbId ? await getIgdbGame(igdbId) : linked;
    if (!game || !psnPlatforms(game).length) throw new PsnError("Choose a game with a PlayStation platform.", 400);
    const existing = await db.select({ platformId: libraryItems.platformId }).from(libraryItems).where(and(eq(libraryItems.userId, userId), eq(libraryItems.igdbId, game.igdbId)));
    const now = Date.now();
    await db.$client.batch([
      db.$client.prepare(setPsnMatch).bind(JSON.stringify(game), now, connection.connectionId, titleKey, token),
      ...importStatements(connection, token, titleKey, game, platformId ?? defaultPsnPlatform(game, JSON.parse(row.platformsJson), existing.map((copy) => copy.platformId)), now, playing),
    ]);
  });
}

// Adds up to 30 matched titles per request, including games the player removed earlier.
export async function addAllPsnGames(userId: string, syncedAt: number) {
  return withPsnLock(userId, async (connection, token) => {
    if (connection.syncedAt !== syncedAt) throw new PsnError("Your PlayStation history changed. Review it before adding everything.", 409);
    const db = getDb();
    const { results } = await db.$client.prepare(readyPsnGames).bind(connection.connectionId).all<{ titleKey: string; gameJson: string; platformsJson: string }>();
    if (!results.length) return;
    const games = results.map((row) => ({ titleKey: row.titleKey, platforms: JSON.parse(row.platformsJson) as string[], game: JSON.parse(row.gameJson) as CatalogGame }));
    const existing = await db.select({ igdbId: libraryItems.igdbId, platformId: libraryItems.platformId }).from(libraryItems)
      .where(and(eq(libraryItems.userId, userId), inArray(libraryItems.igdbId, games.map((row) => row.game.igdbId))));
    const now = Date.now();
    await db.$client.batch(games.flatMap(({ titleKey, platforms, game }) => importStatements(connection, token, titleKey, game,
      defaultPsnPlatform(game, platforms, existing.filter((copy) => copy.igdbId === game.igdbId).map((copy) => copy.platformId)), now, false)));
  });
}

// Reads full trophy lists for a few added games per request, keeping well under Sony's per-account rate limit.
export async function syncPsnTrophies(userId: string) {
  return withPsnLock(userId, async (connection, token) => {
    const db = getDb();
    const { results } = await db.$client.prepare(stalePsnTrophies).bind(connection.connectionId).all<{ id: number; npCommunicationId: string; npServiceName: string | null }>();
    if (!results.length) return;
    const access = await psnAccess(connection, token);
    for (const title of results) {
      const list = await fetchTrophies(access, title.npCommunicationId, title.npServiceName === "trophy2" ? "trophy2" : "trophy");
      const now = Date.now();
      const statements = [
        ...list.trophies.map((entry) => db.$client.prepare(savePsnTrophy).bind(title.npCommunicationId, entry.id, entry.groupId, entry.name, entry.description, entry.iconUrl, entry.grade, entry.isHidden ? 1 : 0, entry.rarity, now)),
        ...list.earned.map((entry) => db.$client.prepare(savePsnUnlock).bind(connection.connectionId, token, title.id, entry.id, entry.earnedAt, now)),
        db.$client.prepare(finishPsnTrophies).bind(connection.connectionId, token, title.id, now),
      ];
      for (let offset = 0; offset < statements.length; offset += 400) await db.$client.batch(statements.slice(offset, offset + 400));
    }
  });
}

// Removes the library copies PlayStation added; ratings and favorites stay with the game, and removed games are ready to add again.
export async function removePsnLibrary(userId: string) {
  return withPsnLock(userId, async (connection, token) => {
    await getDb().$client.prepare(removePsnCopies).bind(userId, connection.connectionId, token).run();
  });
}

// Erases PlayStation data and the stored sign-in. Added RGBoner copies stay put.
export async function disconnectPsn(userId: string) {
  await getDb().delete(psnConnections).where(eq(psnConnections.userId, userId));
}

export const psnShowcaseSize = 12;
export async function getPsnShowcase(userId: string): Promise<{ games: PsnShowcaseGame[]; totals: PsnShowcaseTotals }> {
  const client = getDb().$client;
  const [games, totals] = await client.batch([client.prepare(psnShowcaseQuery).bind(userId, psnShowcaseSize), client.prepare(psnShowcaseTotals).bind(userId)]);
  const summary = (totals.results as PsnShowcaseTotals[])[0];
  return { games: (games.results as (Omit<PsnShowcaseGame, "hasPlatinum"> & { hasPlatinum: number })[]).map((row) => ({ ...row, hasPlatinum: Boolean(row.hasPlatinum) })),
    totals: summary ?? { games: 0, level: null, platinum: 0, gold: 0, silver: 0, bronze: 0, completed: 0 } };
}

export async function getPsnTrophyList(userId: string, titleRowId: number): Promise<PsnTrophy[]> {
  const { results } = await getDb().$client.prepare(psnTrophyListQuery).bind(userId, titleRowId).all<Omit<PsnTrophy, "isHidden" | "grade"> & { isHidden: number; grade: TrophyGrade }>();
  return results.map((row) => ({ ...row, isHidden: Boolean(row.isHidden) }));
}

// Use all: the library copies PlayStation added follow its newer time played again.
export async function applyPsnPlaytime(userId: string) {
  await applyPlaytimeOffers(userId, "psn");
}
