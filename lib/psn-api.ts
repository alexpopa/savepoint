// No runtime bindings here: parsers and the HTTP boundary are exercised with fixture responses.
// Sony has no public API; these are the endpoints the PlayStation App uses, reached with the player's own sign-in.
import { psnTitleName, type PsnTitle, type PsnTrophy, type TrophyCounts, type TrophyGrade } from "./psn-types.ts";

export class PsnError extends Error {
  status: number;
  // True when Sony rejected the stored sign-in and only a fresh NPSSO can fix it.
  reconnect: boolean;
  constructor(message: string, status = 503, reconnect = false) { super(message); this.status = status; this.reconnect = reconnect; }
}
export type PsnTokens = { accessToken: string; refreshToken: string; expiresAt: number };
export type PsnSummary = { accountId: string; level: number | null; earned: TrophyCounts };
export type TrophyTitle = { npCommunicationId: string; npServiceName: "trophy" | "trophy2"; name: string; imageUrl: string | null; platforms: string[];
  defined: TrophyCounts; earned: TrophyCounts; progress: number; lastUpdatedAt: number | null };
export type PlayedTitle = { titleId: string; conceptId: number | null; name: string; imageUrl: string | null; platform: "PS5" | "PS4"; lastPlayedAt: number | null; playSeconds: number | null };
export type PsnTrophyList = { trophies: (Omit<PsnTrophy, "earnedAt" | "rarity"> & { rarity: number | null })[]; earned: { id: number; earnedAt: number }[] };
type Send = typeof fetch;

const authBase = "https://ca.account.sony.com/api/authz/v3/oauth";
const apiBase = "https://m.np.playstation.com/api";
// The PlayStation App's public client, which every NPSSO-based client uses.
const clientId = "09515159-7237-4370-9b40-3806e67c0891";
const clientAuth = "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=";
const redirectUri = "com.scee.psxandroid.scecompcall://redirect";
const scope = "psn:mobile.v2.core psn:clientapp";
export const maxPsnTitles = 10000;
const expired = "Your PlayStation sign-in expired. Reconnect PlayStation with a new NPSSO token.";

export const validNpsso = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9]{64}$/.test(value);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function list(value: unknown) { return Array.isArray(value) ? value : []; }
function count(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function text(value: unknown, max = 300) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
function httpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 1000) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? (url.protocol = "https:", url.toString()) : null; }
  catch { return null; }
}
function time(value: unknown) {
  const at = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(at) && at > Date.UTC(2000, 0, 1) && at <= 8640000000000 ? at : null;
}
function counts(value: unknown): TrophyCounts {
  const row = record(value);
  return { bronze: count(row.bronze), silver: count(row.silver), gold: count(row.gold), platinum: count(row.platinum) };
}
// Play time arrives as an ISO 8601 duration such as PT12H3M4S.
export function durationSeconds(value: unknown) {
  const match = typeof value === "string" ? /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.\d+)?S)?$/.exec(value) : null;
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match.map((part) => Number(part ?? 0));
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

async function json(response: Response) { try { return await response.json() as unknown; } catch { return null; } }

async function tokenRequest(form: Record<string, string>, send: Send): Promise<PsnTokens> {
  const response = await send(`${authBase}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: clientAuth, accept: "application/json" },
    body: new URLSearchParams({ ...form, token_format: "jwt" }), signal: AbortSignal.timeout(15000), redirect: "manual" });
  const body = record(await json(response));
  if (!response.ok) throw body.error === "invalid_grant" || response.status === 400 || response.status === 401 ? new PsnError(expired, 401, true) : new PsnError("PlayStation sign-in is temporarily unavailable. Please try again.");
  const accessToken = text(body.access_token, 10000), refreshToken = text(body.refresh_token, 10000);
  if (!accessToken || !refreshToken) throw new PsnError("PlayStation did not return a usable sign-in. Please connect again.");
  return { accessToken, refreshToken, expiresAt: Date.now() + Math.min(count(body.expires_in) || 3600, 86400) * 1000 };
}

// NPSSO cookie -> authorization code (read from the redirect, never followed) -> access and refresh tokens. The NPSSO is not kept.
export async function exchangeNpsso(npsso: string, send: Send = fetch): Promise<PsnTokens> {
  if (!validNpsso(npsso)) throw new PsnError("Paste the 64-character NPSSO token from Sony.", 400);
  const url = new URL(`${authBase}/authorize`);
  url.search = new URLSearchParams({ access_type: "offline", client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope }).toString();
  const response = await send(url.toString(), { headers: { cookie: `npsso=${npsso}` }, signal: AbortSignal.timeout(15000), redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  let code: string | null = null;
  try { code = new URL(location).searchParams.get("code"); } catch { code = null; }
  if (!code || code.length > 2000) throw new PsnError("Sony did not accept that NPSSO token. Sign in at playstation.com again and copy a fresh one.", 400);
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" }, send);
}

export function refreshPsnToken(refreshToken: string, send: Send = fetch) {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token", scope }, send);
}

async function psnRequest(url: string, accessToken: string, send: Send) {
  const response = await send(url, { headers: { authorization: `Bearer ${accessToken}`, "accept-language": "en-US", accept: "application/json" }, signal: AbortSignal.timeout(15000), redirect: "manual" });
  if (response.status === 429) throw new PsnError("PlayStation is busy. Please wait a few minutes before trying again.", 429);
  if (response.status === 401) throw new PsnError(expired, 401, true);
  if (response.status === 403) throw new PsnError("PlayStation would not share this data. Check that your trophies and game list are visible to you in your PSN privacy settings.", 409);
  if (!response.ok) throw new PsnError("PlayStation is temporarily unavailable. Your saved games are unchanged.");
  return json(response);
}

export function parseTrophySummary(payload: unknown): PsnSummary {
  const body = record(payload);
  const accountId = typeof body.accountId === "string" && /^\d{1,20}$/.test(body.accountId) ? body.accountId : null;
  if (!accountId) throw new PsnError("PlayStation did not return a usable profile. Please connect again.");
  return { accountId, level: count(body.trophyLevel) || null, earned: counts(body.earnedTrophies) };
}
export async function fetchPsnProfile(accessToken: string, send: Send = fetch) {
  const summary = parseTrophySummary(await psnRequest(`${apiBase}/trophy/v1/users/me/trophySummary`, accessToken, send));
  const profile = record(await psnRequest(`${apiBase}/userProfile/v1/internal/users/${summary.accountId}/profiles`, accessToken, send));
  const onlineId = text(profile.onlineId, 16);
  if (!onlineId) throw new PsnError("PlayStation did not return a usable profile. Please connect again.");
  return { ...summary, onlineId };
}
export async function fetchTrophySummary(accessToken: string, send: Send = fetch) {
  return parseTrophySummary(await psnRequest(`${apiBase}/trophy/v1/users/me/trophySummary`, accessToken, send));
}

export function parseTrophyTitles(pages: unknown[]): TrophyTitle[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => list(record(page).trophyTitles).flatMap((value) => {
    const row = record(value);
    const id = typeof row.npCommunicationId === "string" && /^NPWR\d{5}_\d{2}$/.test(row.npCommunicationId) ? row.npCommunicationId : null;
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const platforms = typeof row.trophyTitlePlatform === "string" ? row.trophyTitlePlatform.split(",").map((name) => name.trim()).filter((name) => /^(PS5|PS4|PS3|PSVITA|PSPC)$/.test(name)) : [];
    return [{ npCommunicationId: id, npServiceName: row.npServiceName === "trophy2" ? "trophy2" as const : "trophy" as const, name: text(row.trophyTitleName) ?? id,
      imageUrl: httpsUrl(row.trophyTitleIconUrl), platforms, defined: counts(row.definedTrophies), earned: counts(row.earnedTrophies),
      progress: Math.min(100, count(row.progress)), lastUpdatedAt: time(row.lastUpdatedDateTime) }];
  }));
}

export function parsePlayedTitles(pages: unknown[]): PlayedTitle[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => list(record(page).titles).flatMap((value) => {
    const row = record(value);
    const titleId = typeof row.titleId === "string" && /^[A-Z]{4}\d{5}_\d{2}$/.test(row.titleId) ? row.titleId : null;
    const platform = row.category === "ps5_native_game" ? "PS5" as const : row.category === "ps4_game" ? "PS4" as const : null;
    if (!titleId || !platform || seen.has(titleId)) return [];
    seen.add(titleId);
    const concept = record(row.concept);
    const conceptId = typeof concept.id === "number" && Number.isSafeInteger(concept.id) && concept.id > 0 ? concept.id : null;
    return [{ titleId, conceptId, name: text(row.localizedName) ?? text(row.name) ?? titleId, imageUrl: httpsUrl(row.localizedImageUrl) ?? httpsUrl(row.imageUrl), platform,
      lastPlayedAt: time(row.lastPlayedDateTime), playSeconds: durationSeconds(row.playDuration) }];
  }));
}

// Follows Sony's offsets, with a hard page cap so a misbehaving response cannot loop.
async function pages(url: (offset: number) => string, key: string, accessToken: string, send: Send) {
  const result: unknown[] = [];
  let offset = 0, seen = 0;
  for (let page = 0; page < 60; page++) {
    const body = record(await psnRequest(url(offset), accessToken, send));
    if (!Array.isArray(body[key])) throw new PsnError("PlayStation did not return your games. Please try again.");
    result.push(body);
    seen += (body[key] as unknown[]).length;
    if (seen > maxPsnTitles) throw new PsnError("PlayStation histories above 10,000 games are not supported yet.", 400);
    const next = body.nextOffset;
    if (typeof next !== "number" || !Number.isSafeInteger(next) || next <= offset || !(body[key] as unknown[]).length) break;
    offset = next;
  }
  return result;
}
export async function fetchTrophyTitles(accessToken: string, send: Send = fetch) {
  return parseTrophyTitles(await pages((offset) => `${apiBase}/trophy/v1/users/me/trophyTitles?limit=800&offset=${offset}`, "trophyTitles", accessToken, send));
}
export async function fetchPlayedTitles(accessToken: string, send: Send = fetch) {
  return parsePlayedTitles(await pages((offset) => `${apiBase}/gamelist/v2/users/me/titles?categories=ps4_game,ps5_native_game&limit=200&offset=${offset}`, "titles", accessToken, send));
}

// Sony links a played title ID to its trophy lists five IDs at a time. Titles without trophies come back empty.
export async function fetchTitleLinks(accessToken: string, titleIds: string[], send: Send = fetch) {
  const links = new Map<string, string[]>(titleIds.map((id) => [id, []]));
  for (let offset = 0; offset < titleIds.length; offset += 5) {
    const body = record(await psnRequest(`${apiBase}/trophy/v1/users/me/titles/trophyTitles?npTitleIds=${titleIds.slice(offset, offset + 5).join(",")}`, accessToken, send));
    for (const value of list(body.titles)) {
      const row = record(value);
      const ids = list(row.trophyTitles).flatMap((title) => { const id = record(title).npCommunicationId; return typeof id === "string" && /^NPWR\d{5}_\d{2}$/.test(id) ? [id] : []; });
      if (typeof row.npTitleId === "string" && links.has(row.npTitleId)) links.set(row.npTitleId, ids);
    }
  }
  return links;
}

const grades: TrophyGrade[] = ["bronze", "silver", "gold", "platinum"];
export function parseTrophies(definitions: unknown, earned: unknown): PsnTrophyList {
  const result: PsnTrophyList = { trophies: [], earned: [] };
  for (const value of list(record(definitions).trophies)) {
    const row = record(value);
    const id = row.trophyId;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0 || result.trophies.some((entry) => entry.id === id)) continue;
    const grade = grades.find((entry) => entry === row.trophyType);
    if (!grade) continue;
    result.trophies.push({ id, groupId: text(row.trophyGroupId, 10) ?? "default", name: text(row.trophyName) ?? "Hidden trophy", description: text(row.trophyDetail, 1000),
      iconUrl: httpsUrl(row.trophyIconUrl), grade, isHidden: row.trophyHidden === true, rarity: null });
  }
  for (const value of list(record(earned).trophies)) {
    const row = record(value);
    const trophy = result.trophies.find((entry) => entry.id === row.trophyId);
    if (!trophy) continue;
    const rate = typeof row.trophyEarnedRate === "string" ? Number(row.trophyEarnedRate) : NaN;
    if (Number.isFinite(rate) && rate >= 0 && rate <= 100) trophy.rarity = Math.round(rate * 10);
    const earnedAt = row.earned === true ? time(row.earnedDateTime) : null;
    if (earnedAt && !result.earned.some((entry) => entry.id === trophy.id)) result.earned.push({ id: trophy.id, earnedAt });
  }
  return result;
}

export async function fetchTrophies(accessToken: string, npCommunicationId: string, npServiceName: "trophy" | "trophy2", send: Send = fetch): Promise<PsnTrophyList> {
  const query = `npServiceName=${npServiceName}`;
  const definitions = await psnRequest(`${apiBase}/trophy/v1/npCommunicationIds/${npCommunicationId}/trophyGroups/all/trophies?${query}`, accessToken, send);
  const earned = await psnRequest(`${apiBase}/trophy/v1/users/me/npCommunicationIds/${npCommunicationId}/trophyGroups/all/trophies?${query}`, accessToken, send);
  return parseTrophies(definitions, earned);
}

const none: TrophyCounts = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
const newest = (...values: (number | null)[]) => values.reduce<number | null>((best, value) => value !== null && (best === null || value > best) ? value : best, null);

// Merges Sony's two lists into one row per game. A played concept joins a trophy list Sony linked it to,
// otherwise one with the same name on a platform it was played on; anything left stays its own row.
// `checked` holds title IDs already looked up, so concept rows know whether to ask Sony again.
export function mergePsnTitles(trophyTitles: TrophyTitle[], played: PlayedTitle[], links: Map<string, string[]>, checked: Set<string> = new Set()): (PsnTitle & { linksChecked: boolean })[] {
  const concepts = new Map<string, PlayedTitle[]>();
  for (const title of played) {
    const key = title.conceptId ? `concept:${title.conceptId}` : `title:${title.titleId}`;
    concepts.set(key, [...(concepts.get(key) ?? []), title]);
  }
  const byId = new Map(trophyTitles.map((title) => [title.npCommunicationId, title]));
  const joined = new Map<string, PlayedTitle[]>();
  const alone: PlayedTitle[][] = [];
  // Each played version joins its own platform's list, so a game owned on PS4 and PS5 keeps two rows with their own playtime.
  for (const group of concepts.values()) {
    const targets = new Map<string, PlayedTitle[]>();
    const unplaced: PlayedTitle[] = [];
    for (const title of group) {
      const linked = (links.get(title.titleId) ?? []).flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
      const candidates = linked.length ? linked : trophyTitles.filter((list) => list.platforms.includes(title.platform) && psnTitleName(list.name) === psnTitleName(title.name));
      const target = candidates.find((list) => list.platforms.includes(title.platform)) ?? candidates[0];
      if (target) targets.set(target.npCommunicationId, [...(targets.get(target.npCommunicationId) ?? []), title]);
      else unplaced.push(title);
    }
    // A version with no list of its own stays with its concept's list rather than becoming a second row.
    const [first] = targets.keys();
    if (first) targets.get(first)!.push(...unplaced);
    else alone.push(unplaced);
    for (const [id, titles] of targets) joined.set(id, [...(joined.get(id) ?? []), ...titles]);
  }
  const playedPart = (group: PlayedTitle[]) => ({
    conceptId: group.find((title) => title.conceptId)?.conceptId ?? null, titleIds: group.map((title) => title.titleId),
    lastPlayedAt: newest(...group.map((title) => title.lastPlayedAt)), playSeconds: group.reduce<number | null>((total, title) => title.playSeconds ? (total ?? 0) + title.playSeconds : total, null),
  });
  const rows: (PsnTitle & { linksChecked: boolean })[] = trophyTitles.map((title) => {
    const group = joined.get(title.npCommunicationId) ?? [];
    const part = playedPart(group);
    return { titleKey: title.npCommunicationId, name: group[0]?.name ?? title.name, imageUrl: group.find((entry) => entry.imageUrl)?.imageUrl ?? title.imageUrl,
      platforms: [...new Set([...title.platforms, ...group.map((entry) => entry.platform)])], npCommunicationId: title.npCommunicationId, npServiceName: title.npServiceName,
      ...part, lastPlayedAt: newest(part.lastPlayedAt, title.lastUpdatedAt), earned: title.earned, defined: title.defined, progress: title.progress, linksChecked: true };
  });
  for (const group of alone) {
    const part = playedPart(group);
    rows.push({ titleKey: part.conceptId ? `concept:${part.conceptId}` : `title:${group[0].titleId}`, name: group[0].name, imageUrl: group.find((entry) => entry.imageUrl)?.imageUrl ?? null,
      platforms: [...new Set(group.map((entry) => entry.platform))], npCommunicationId: null, npServiceName: null, ...part,
      earned: none, defined: none, progress: 0, linksChecked: group.every((title) => checked.has(title.titleId)) });
  }
  return rows;
}
