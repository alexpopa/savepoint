// No runtime bindings here: parsers and the HTTP boundary are exercised with fixture responses.
// RetroAchievements' Web API is public; every request uses the site's own Web API key, never a player credential.
import { raSubset, type RaGame } from "./ra-types.ts";

export class RaError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}
export type RaProfile = { ulid: string; username: string; motto: string; hardcorePoints: number; softcorePoints: number; retroPoints: number };
export type RaProgress = { gameId: number; title: string; consoleId: number; consoleName: string; imageUrl: string | null; total: number; earned: number; earnedHardcore: number;
  lastAwardedAt: number | null; awardKind: string | null; awardAt: number | null };
export type RaAwardTotals = { beatenHardcore: number; beatenSoftcore: number; mastered: number; completed: number };
export type RaGameAwards = { beatenAt: number | null; beatenHardcore: boolean; masteredAt: number | null; masteredHardcore: boolean };
export type RaAwards = { totals: RaAwardTotals; games: Map<number, RaGameAwards> };
export type RaAchievementList = {
  title: string; playSeconds: number | null;
  achievements: { id: number; title: string; description: string | null; badgeUrl: string | null; points: number; displayOrder: number; rarity: number | null }[];
  earned: { id: number; earnedAt: number; hardcore: boolean }[];
};
type Send = typeof fetch;

const apiBase = "https://retroachievements.org/API";
const mediaBase = "https://media.retroachievements.org";
// RetroAchievements asks integrations to identify themselves.
const userAgent = "RGBoner/1.0";
export const maxRaGames = 10000;
// RetroAchievements asks integrations to keep verification codes in the 50-character motto only briefly.
export const raLinkLifetime = 15 * 60000;
const notFound = "RetroAchievements couldn’t find that account. Check the username and try again.";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function list(value: unknown) { return Array.isArray(value) ? value : []; }
function count(value: unknown) {
  const number = typeof value === "string" && /^\d{1,12}$/.test(value) ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
function id(value: unknown) { const number = count(value); return number > 0 && number < 10_000_000 ? number : null; }
function text(value: unknown, max = 300) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
// RA sends ISO times with an offset, or "YYYY-MM-DD HH:MM:SS" in UTC.
export function raTime(value: unknown) {
  if (typeof value !== "string") return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const at = Date.parse(iso);
  return Number.isFinite(at) && at > Date.UTC(2000, 0, 1) && at <= 8640000000000 ? at : null;
}
function image(value: unknown) { return typeof value === "string" && /^\/Images\/\d{1,10}\.png$/.test(value) ? `${mediaBase}${value}` : null; }
function badge(value: unknown) { return typeof value === "string" && /^\d{1,10}$/.test(value) ? `${mediaBase}/Badge/${value}.png` : null; }
const newest = (...values: (number | null)[]) => values.reduce<number | null>((best, value) => value !== null && (best === null || value > best) ? value : best, null);
const earliest = (...values: (number | null)[]) => values.reduce<number | null>((best, value) => value !== null && (best === null || value < best) ? value : best, null);

async function raRequest(endpoint: string, params: Record<string, string | number>, apiKey: string, send: Send) {
  const url = new URL(`${apiBase}/API_${endpoint}.php`);
  url.search = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])), y: apiKey }).toString();
  const response = await send(url.toString(), { headers: { accept: "application/json", "user-agent": userAgent }, signal: AbortSignal.timeout(15000), redirect: "manual" });
  if (response.status === 404) throw new RaError(notFound, 404);
  if (response.status === 429) throw new RaError("RetroAchievements is busy. Please wait a few minutes before trying again.", 429);
  if (response.status === 401 || response.status === 403) throw new RaError("RetroAchievements didn’t accept RGBoner’s API key. Ask the site owner to check it.");
  if (!response.ok) throw new RaError("RetroAchievements is temporarily unavailable. Your saved games are unchanged.");
  try { return await response.json() as unknown; } catch { throw new RaError("RetroAchievements returned an unreadable response. Please try again."); }
}

export function parseRaProfile(payload: unknown): RaProfile {
  const body = record(payload);
  const ulid = typeof body.ULID === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(body.ULID) ? body.ULID : null;
  const username = text(body.User, 64);
  if (!ulid || !username) throw new RaError(notFound, 404);
  return { ulid, username, motto: typeof body.Motto === "string" ? body.Motto.slice(0, 200) : "",
    hardcorePoints: count(body.TotalPoints), softcorePoints: count(body.TotalSoftcorePoints), retroPoints: count(body.TotalTruePoints) };
}
// Accepts a username or a ULID; RA resolves either.
export async function fetchRaProfile(user: string, apiKey: string, send: Send = fetch) {
  return parseRaProfile(await raRequest("GetUserProfile", { u: user }, apiKey, send));
}

export function parseCompletionProgress(pages: unknown[]): RaProgress[] {
  const seen = new Set<number>();
  return pages.flatMap((page) => list(record(page).Results).flatMap((value) => {
    const row = record(value);
    const gameId = id(row.GameID), consoleId = id(row.ConsoleID);
    if (!gameId || !consoleId || seen.has(gameId)) return [];
    seen.add(gameId);
    return [{ gameId, title: text(row.Title) ?? `Game ${gameId}`, consoleId, consoleName: text(row.ConsoleName, 80) ?? "RetroAchievements", imageUrl: image(row.ImageIcon),
      total: count(row.MaxPossible), earned: count(row.NumAwarded), earnedHardcore: count(row.NumAwardedHardcore), lastAwardedAt: raTime(row.MostRecentAwardedDate),
      awardKind: typeof row.HighestAwardKind === "string" && /^(beaten-softcore|beaten-hardcore|completed|mastered)$/.test(row.HighestAwardKind) ? row.HighestAwardKind : null,
      awardAt: raTime(row.HighestAwardDate) }];
  }));
}
// Follows RA's offsets up to the reported total, with a hard page cap so a misbehaving response cannot loop.
export async function fetchCompletionProgress(ulid: string, apiKey: string, send: Send = fetch) {
  const pages: unknown[] = [];
  for (let offset = 0, page = 0; page < maxRaGames / 500; page++, offset += 500) {
    const body = record(await raRequest("GetUserCompletionProgress", { u: ulid, c: 500, o: offset }, apiKey, send));
    if (!Array.isArray(body.Results)) throw new RaError("RetroAchievements did not return your games. Please try again.");
    pages.push(body);
    if (count(body.Total) > maxRaGames) throw new RaError("RetroAchievements histories above 10,000 games are not supported yet.", 400);
    if (body.Results.length < 500 || offset + 500 >= count(body.Total)) break;
  }
  return parseCompletionProgress(pages);
}

export function parseRaAwards(payload: unknown): RaAwards {
  const body = record(payload);
  const games = new Map<number, RaGameAwards>();
  for (const value of list(body.VisibleUserAwards)) {
    const row = record(value);
    const gameId = id(row.AwardData), at = raTime(row.AwardedAt);
    if (!gameId || !at) continue;
    const hardcore = count(row.AwardDataExtra) === 1;
    const entry = games.get(gameId) ?? { beatenAt: null, beatenHardcore: false, masteredAt: null, masteredHardcore: false };
    if (row.AwardType === "Game Beaten") { entry.beatenAt = earliest(entry.beatenAt, at); entry.beatenHardcore ||= hardcore; }
    else if (row.AwardType === "Mastery/Completion") { entry.masteredAt = earliest(entry.masteredAt, at); entry.masteredHardcore ||= hardcore; }
    else continue;
    games.set(gameId, entry);
  }
  return { games, totals: { beatenHardcore: count(body.BeatenHardcoreAwardsCount), beatenSoftcore: count(body.BeatenSoftcoreAwardsCount),
    mastered: count(body.MasteryAwardsCount), completed: count(body.CompletionAwardsCount) } };
}
export async function fetchRaAwards(ulid: string, apiKey: string, send: Send = fetch) {
  return parseRaAwards(await raRequest("GetUserAwards", { u: ulid }, apiKey, send));
}

// RA only reports last played times for the 50 most recent games; older games fall back to their newest unlock.
export function parseRecentlyPlayed(payload: unknown) {
  const played = new Map<number, number>();
  for (const value of list(payload)) {
    const row = record(value);
    const gameId = id(row.GameID), at = raTime(row.LastPlayed);
    if (gameId && at) played.set(gameId, at);
  }
  return played;
}
export async function fetchRecentlyPlayed(ulid: string, apiKey: string, send: Send = fetch) {
  return parseRecentlyPlayed(await raRequest("GetUserRecentlyPlayedGames", { u: ulid, c: 50 }, apiKey, send));
}

// Only needed for a subset whose main game is not in the player's list.
export async function fetchSubsetParent(gameId: number, apiKey: string, send: Send = fetch) {
  return id(record(await raRequest("GetGameExtended", { i: gameId }, apiKey, send)).ParentGameID);
}

export function parseGameProgress(payload: unknown): RaAchievementList {
  const body = record(payload);
  const players = count(body.NumDistinctPlayers);
  const result: RaAchievementList = { title: text(body.Title) ?? "", playSeconds: count(body.UserTotalPlaytime) || null, achievements: [], earned: [] };
  for (const value of Object.values(record(body.Achievements))) {
    const row = record(value);
    const achievementId = id(row.ID);
    if (!achievementId || result.achievements.some((entry) => entry.id === achievementId)) continue;
    const awarded = count(row.NumAwarded);
    result.achievements.push({ id: achievementId, title: text(row.Title) ?? "Achievement", description: text(row.Description, 1000), badgeUrl: badge(row.BadgeName),
      points: count(row.Points), displayOrder: count(row.DisplayOrder), rarity: players ? Math.min(1000, Math.round(awarded / players * 1000)) : null });
    const hardcoreAt = raTime(row.DateEarnedHardcore), earnedAt = earliest(raTime(row.DateEarned), hardcoreAt);
    if (earnedAt) result.earned.push({ id: achievementId, earnedAt, hardcore: hardcoreAt !== null });
  }
  return result;
}
export async function fetchGameProgress(gameId: number, ulid: string, apiKey: string, send: Send = fetch) {
  return parseGameProgress(await raRequest("GetGameInfoAndUserProgress", { g: gameId, u: ulid }, apiKey, send));
}

// Folds subsets into their main game. A subset joins the main game RA names as its parent, otherwise the game
// with the same base title on the same console. Subsets with neither are returned for a parent lookup.
export function mergeRaGames(progress: RaProgress[], awards: RaAwards, recent: Map<number, number>, parents: Map<number, number>) {
  const byId = new Map(progress.map((row) => [row.gameId, row]));
  const groups = new Map<number, { main: RaProgress | null; subsets: RaProgress[]; name: string; consoleId: number; consoleName: string; imageUrl: string | null }>();
  const unplaced: number[] = [];
  for (const row of progress) {
    const subset = raSubset(row.title);
    if (!subset) {
      const group = groups.get(row.gameId);
      groups.set(row.gameId, { main: row, subsets: group?.subsets ?? [], name: row.title, consoleId: row.consoleId, consoleName: row.consoleName, imageUrl: row.imageUrl ?? group?.imageUrl ?? null });
      continue;
    }
    const parentId = parents.get(row.gameId) ?? progress.find((entry) => !raSubset(entry.title) && entry.consoleId === row.consoleId && entry.title === subset.base)?.gameId;
    if (!parentId) { unplaced.push(row.gameId); continue; }
    const group = groups.get(parentId) ?? { main: null, subsets: [], name: byId.get(parentId)?.title ?? subset.base, consoleId: row.consoleId, consoleName: row.consoleName, imageUrl: row.imageUrl };
    group.subsets.push(row);
    groups.set(parentId, group);
  }
  const games: RaGame[] = [...groups].map(([gameId, group]) => {
    const sets = [...(group.main ? [group.main] : []), ...group.subsets];
    const award = awards.games.get(gameId);
    // Beaten in either mode; a set without beaten criteria completes when mastered or completed. Awards a player
    // hid on RA fall back to the highest award RA reports for the game.
    const kind = group.main?.awardKind ?? null;
    const completedAt = award?.beatenAt ?? award?.masteredAt ?? (kind ? group.main?.awardAt ?? null : null);
    return { gameId, subsetIds: group.subsets.map((row) => row.gameId), name: group.name, consoleId: group.consoleId, consoleName: group.consoleName, imageUrl: group.imageUrl,
      earned: sets.reduce((sum, row) => sum + row.earned, 0), earnedHardcore: sets.reduce((sum, row) => sum + row.earnedHardcore, 0), total: sets.reduce((sum, row) => sum + row.total, 0),
      lastPlayedAt: newest(...sets.map((row) => recent.get(row.gameId) ?? null), ...sets.map((row) => row.lastAwardedAt)),
      completedAt, completedHardcore: completedAt !== null && (award?.beatenHardcore || award?.masteredHardcore || kind === "beaten-hardcore" || kind === "mastered") === true };
  });
  return { games, unplaced };
}
