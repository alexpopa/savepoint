// No runtime bindings here: parsers and the HTTP boundary are exercised with fixture responses.
export type SteamGame = { appId: number; name: string; playtimeMinutes: number | null; recentMinutes: number | null; lastPlayedAt: number | null };
export class SteamError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function minutes(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
export function validAppId(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 4294967295; }
export function parseSteamGames(payload: unknown, owned: boolean): SteamGame[] {
  const response = record(record(payload).response);
  const count = response[owned ? "game_count" : "total_count"];
  if (count === 0 && (response.games === undefined || (Array.isArray(response.games) && response.games.length === 0))) return [];
  if (Array.isArray(response.games) && response.games.length > 10000) throw new SteamError("Steam libraries above 10,000 games are not supported yet.", 400);
  if (!Array.isArray(response.games) || !Number.isSafeInteger(count) || count !== response.games.length)
    throw new SteamError("Steam did not return a complete visible library. Check your Steam Game details privacy setting and try again.", 409);
  const seen = new Set<number>();
  return response.games.map((value) => {
    const game = record(value);
    if (!validAppId(game.appid) || seen.has(game.appid)) throw new SteamError("Steam returned an invalid game list. Please try again.");
    seen.add(game.appid);
    const lastPlayed = minutes(game.rtime_last_played);
    return { appId: game.appid, name: typeof game.name === "string" ? game.name.slice(0, 300) : `Steam app ${game.appid}`,
      playtimeMinutes: minutes(game.playtime_forever), recentMinutes: minutes(game.playtime_2weeks),
      lastPlayedAt: lastPlayed && lastPlayed <= 8640000000000 ? lastPlayed * 1000 : null };
  });
}

export async function steamRequest(method: "GetOwnedGames" | "GetRecentlyPlayedGames", steamId: string, key: string, send: typeof fetch = fetch) {
  if (!key) throw new SteamError("Steam is not configured yet. Ask the site owner to configure its API key.");
  const url = new URL(`https://api.steampowered.com/IPlayerService/${method}/v1/`);
  url.searchParams.set("key", key);
  url.searchParams.set("input_json", JSON.stringify({ steamid: steamId, ...(method === "GetOwnedGames" ? { include_appinfo: true, include_played_free_games: true } : { count: 0 }) }));
  const response = await send(url, { signal: AbortSignal.timeout(15000), redirect: "manual" });
  if (!response.ok) throw new SteamError(response.status === 429 ? "Steam is busy. Please wait before refreshing again." : "Steam is temporarily unavailable. Your saved games are unchanged.");
  return parseSteamGames(await response.json(), method === "GetOwnedGames");
}
