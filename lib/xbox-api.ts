// No runtime bindings here: parsers and the HTTP boundary are exercised with fixture responses.
import type { XboxAchievement, XboxTitle } from "./xbox-types.ts";

export class XboxError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}
export type XboxAuth = { token: string; uhs: string; xuid: string; gamertag: string; expiresAt: number };
export type MicrosoftTokens = { accessToken: string; refreshToken: string };
export type XboxAchievementList = { achievements: (Omit<XboxAchievement, "unlockedAt"> & { sortOrder: number })[]; unlocks: { id: string; unlockedAt: number }[] };
type Send = typeof fetch;

const authority = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const scope = "XboxLive.signin offline_access";
export const xboxLinkLifetime = 10 * 60 * 1000;
export const maxXboxTitles = 10000;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function count(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function text(value: unknown, max = 300) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
function httpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 1000) return null;
  try { const url = new URL(value.startsWith("//") ? `https:${value}` : value); return url.protocol === "https:" || url.protocol === "http:" ? (url.protocol = "https:", url.toString()) : null; }
  catch { return null; }
}
// Xbox reports never-unlocked achievements with a year-1 timestamp.
function time(value: unknown) {
  const at = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(at) && at > Date.UTC(2000, 0, 1) && at <= 8640000000000 ? at : null;
}
function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }

export function randomToken() { return base64Url(crypto.getRandomValues(new Uint8Array(32))); }
export async function pkceChallenge(verifier: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

export function xboxLoginUrl(clientId: string, redirectUri: string, state: string, challenge: string) {
  const url = new URL(`${authority}/authorize`);
  url.search = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope, state,
    code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" }).toString();
  return url.toString();
}

async function json(response: Response) { try { return await response.json() as unknown; } catch { return null; } }

async function microsoftToken(form: Record<string, string>, send: Send): Promise<MicrosoftTokens> {
  const response = await send(`${authority}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ ...form, scope }), signal: AbortSignal.timeout(15000), redirect: "manual" });
  const body = record(await json(response));
  if (!response.ok) throw new XboxError(body.error === "invalid_grant" ? "Your Microsoft sign-in expired. Disconnect Xbox and connect it again." : "Microsoft sign-in is temporarily unavailable. Please try again.", body.error === "invalid_grant" ? 401 : 503);
  const accessToken = text(body.access_token, 10000), refreshToken = text(body.refresh_token, 10000);
  if (!accessToken || !refreshToken) throw new XboxError("Microsoft did not return a usable sign-in. Please connect again.");
  return { accessToken, refreshToken };
}

export function exchangeXboxCode(clientId: string, clientSecret: string, redirectUri: string, code: string, verifier: string, send: Send = fetch) {
  return microsoftToken({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }, send);
}
export function refreshMicrosoftToken(clientId: string, clientSecret: string, refreshToken: string, send: Send = fetch) {
  return microsoftToken({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }, send);
}

const xstsErrors: Record<string, string> = {
  "2148916233": "This Microsoft account has no Xbox profile yet. Sign in to Xbox once, then connect again.",
  "2148916235": "Xbox Live is not available in this account's country or region.",
  "2148916236": "This Xbox account needs adult verification before it can be connected.",
  "2148916237": "This Xbox account needs adult verification before it can be connected.",
  "2148916238": "Child accounts need a parent to add them to a Microsoft family before connecting.",
};

async function xboxAuthRequest(url: string, payload: unknown, send: Send) {
  const response = await send(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-xbl-contract-version": "1" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), redirect: "manual" });
  const body = record(await json(response));
  if (!response.ok) throw new XboxError(xstsErrors[String(body.XErr)] ?? "Xbox Live sign-in is temporarily unavailable. Please try again.", body.XErr ? 409 : 503);
  return body;
}

// Microsoft access token -> Xbox Live user token -> XSTS token for the Xbox Live web services.
export async function authorizeXbox(accessToken: string, send: Send = fetch): Promise<XboxAuth> {
  const user = await xboxAuthRequest("https://user.auth.xboxlive.com/user/authenticate", {
    Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${accessToken}` }, RelyingParty: "http://auth.xboxlive.com", TokenType: "JWT" }, send);
  const userToken = text(user.Token, 10000);
  if (!userToken) throw new XboxError("Xbox Live did not return a usable sign-in. Please connect again.");
  const xsts = await xboxAuthRequest("https://xsts.auth.xboxlive.com/xsts/authorize", {
    Properties: { SandboxId: "RETAIL", UserTokens: [userToken] }, RelyingParty: "http://xboxlive.com", TokenType: "JWT" }, send);
  const claims = record((record(xsts.DisplayClaims).xui as unknown[] | undefined)?.[0]);
  const token = text(xsts.Token, 10000), uhs = text(claims.uhs, 100), xuid = text(claims.xid, 30), gamertag = text(claims.gtg, 50);
  const expiresAt = time(xsts.NotAfter);
  if (!token || !uhs || !xuid || !/^\d{1,20}$/.test(xuid) || !gamertag || !expiresAt) throw new XboxError("Xbox Live did not return a usable profile. Please connect again.");
  return { token, uhs, xuid, gamertag, expiresAt };
}

async function xboxRequest(url: string, auth: XboxAuth, version: number, send: Send) {
  const response = await send(url, { headers: { authorization: `XBL3.0 x=${auth.uhs};${auth.token}`, "x-xbl-contract-version": String(version), "accept-language": "en-US", accept: "application/json" },
    signal: AbortSignal.timeout(15000), redirect: "manual" });
  if (response.status === 429) throw new XboxError("Xbox is busy. Please wait a few minutes before trying again.", 429);
  if (response.status === 401) throw new XboxError("Your Xbox sign-in expired. Please refresh again.", 401);
  if (!response.ok) throw new XboxError("Xbox is temporarily unavailable. Your saved games are unchanged.");
  return json(response);
}

export function parseTitleHistory(payload: unknown): XboxTitle[] {
  const titles = record(payload).titles;
  if (!Array.isArray(titles)) throw new XboxError("Xbox did not return your game history. Please try again.");
  if (titles.length > maxXboxTitles) throw new XboxError("Xbox histories above 10,000 games are not supported yet.", 400);
  const seen = new Set<number>();
  return titles.flatMap((value) => {
    const title = record(value);
    const titleId = Number(title.titleId);
    if (title.type !== "Game" || typeof title.titleId !== "string" || !/^\d{1,10}$/.test(title.titleId) || titleId < 1 || titleId > 4294967295 || seen.has(titleId)) return [];
    seen.add(titleId);
    const achievement = record(title.achievement);
    const products = [title.productId, ...(Array.isArray(title.productIds) ? title.productIds : [])].filter((id): id is string => typeof id === "string" && /^[A-Z0-9]{12}$/.test(id));
    return [{ titleId, name: text(title.name) ?? `Xbox title ${titleId}`, imageUrl: httpsUrl(title.displayImage), productId: products[0] ?? null,
      devices: Array.isArray(title.devices) ? title.devices.filter((device): device is string => typeof device === "string" && device.length <= 30).slice(0, 10) : [],
      lastPlayedAt: time(record(title.titleHistory).lastTimePlayed),
      currentAchievements: count(achievement.currentAchievements), totalAchievements: count(achievement.totalAchievements),
      currentGamerscore: count(achievement.currentGamerscore), totalGamerscore: count(achievement.totalGamerscore),
      achievementVersion: achievement.sourceVersion === 1 ? 1 as const : 2 as const }];
  });
}

export async function fetchTitleHistory(auth: XboxAuth, send: Send = fetch) {
  return parseTitleHistory(await xboxRequest(`https://titlehub.xboxlive.com/users/xuid(${auth.xuid})/titles/titlehistory/decoration/achievement,image,productId`, auth, 2, send));
}

export function parseModernAchievements(pages: unknown[]): XboxAchievementList {
  const result: XboxAchievementList = { achievements: [], unlocks: [] };
  for (const page of pages) for (const value of (record(page).achievements as unknown[] | undefined) ?? []) {
    const row = record(value);
    const id = typeof row.id === "number" || typeof row.id === "string" ? String(row.id).slice(0, 50) : null;
    const name = text(row.name);
    if (!id || !name || result.achievements.some((entry) => entry.id === id)) continue;
    const icon = (row.mediaAssets as unknown[] | undefined)?.map(record).find((asset) => asset.type === "Icon");
    const reward = (row.rewards as unknown[] | undefined)?.map(record).find((entry) => entry.type === "Gamerscore");
    const rarity = record(row.rarity).currentPercentage;
    result.achievements.push({ id, name, description: text(row.description, 1000), iconUrl: httpsUrl(icon?.url), gamerscore: count(Number(reward?.value ?? 0)),
      isSecret: row.isSecret === true, rarity: typeof rarity === "number" && rarity >= 0 && rarity <= 100 ? Math.round(rarity * 10) : null, sortOrder: result.achievements.length });
    const unlockedAt = row.progressState === "Achieved" ? time(record(row.progression).timeUnlocked) : null;
    if (unlockedAt) result.unlocks.push({ id, unlockedAt });
  }
  return result;
}

// Xbox 360 lists definitions and earned achievements separately.
export function parseLegacyAchievements(titleId: number, definitions: unknown, earned: unknown): XboxAchievementList {
  const hex = titleId.toString(16);
  const result: XboxAchievementList = { achievements: [], unlocks: [] };
  const rows = [...((record(definitions).achievements as unknown[] | undefined) ?? []), ...((record(earned).achievements as unknown[] | undefined) ?? [])].map(record);
  for (const row of rows) {
    if (typeof row.id !== "number" || !Number.isSafeInteger(row.id)) continue;
    const id = String(row.id), name = text(row.name);
    const unlockedAt = row.unlocked === true ? time(row.timeUnlocked) : null;
    if (unlockedAt && !result.unlocks.some((entry) => entry.id === id)) result.unlocks.push({ id, unlockedAt });
    if (!name || result.achievements.some((entry) => entry.id === id)) continue;
    const imageId = typeof row.imageId === "number" && Number.isSafeInteger(row.imageId) && row.imageId > 0 ? row.imageId.toString(16) : null;
    result.achievements.push({ id, name, description: text(row.description, 1000) ?? text(row.lockedDescription, 1000), gamerscore: count(row.gamerscore),
      iconUrl: imageId ? `https://image-ssl.xboxlive.com/global/t.${hex}/ach/0/${imageId}` : null, isSecret: row.isSecret === true, rarity: null, sortOrder: result.achievements.length });
  }
  return result;
}

export async function fetchAchievements(auth: XboxAuth, titleId: number, version: 1 | 2, send: Send = fetch): Promise<XboxAchievementList> {
  const base = `https://achievements.xboxlive.com/users/xuid(${auth.xuid})`;
  if (version === 1) {
    const [definitions, earned] = [await xboxRequest(`${base}/titleachievements?titleId=${titleId}&maxItems=1000`, auth, 1, send), await xboxRequest(`${base}/achievements?titleId=${titleId}&maxItems=1000`, auth, 1, send)];
    return parseLegacyAchievements(titleId, definitions, earned);
  }
  const pages: unknown[] = [];
  let continuation: string | null = null;
  // A few pages cover the largest lists; stop rather than follow an endless continuation.
  for (let page = 0; page < 5; page++) {
    const url = `${base}/achievements?titleId=${titleId}&maxItems=1000${continuation ? `&continuationToken=${encodeURIComponent(continuation)}` : ""}`;
    const body = await xboxRequest(url, auth, 2, send);
    pages.push(body);
    continuation = text(record(record(body).pagingInfo).continuationToken, 500);
    if (!continuation) break;
  }
  return parseModernAchievements(pages);
}
