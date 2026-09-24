import { env } from "cloudflare:workers";

type IgdbGame = {
  id: number;
  name: string;
  first_release_date?: number;
  cover?: { image_id?: string };
  platforms?: { id: number; name: string }[];
  summary?: string;
  storyline?: string;
  genres?: { name: string }[];
  game_modes?: { name: string }[];
  player_perspectives?: { name: string }[];
  themes?: { name: string }[];
  involved_companies?: { company?: { name: string }; developer?: boolean; publisher?: boolean }[];
  total_rating?: number;
  total_rating_count?: number;
  screenshots?: { image_id?: string }[];
};

export type IgdbPlatform = { id: number; name: string };

let cachedToken: { value: string; expiresAt: number } | null = null;
let cachedPlatforms: { value: IgdbPlatform[]; expiresAt: number } | null = null;

async function getToken() {
  const clientId = env.IGDB_CLIENT_ID;
  const clientSecret = env.IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("IGDB is not configured. Add IGDB_CLIENT_ID and IGDB_CLIENT_SECRET to your local environment.");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" });
  const response = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("Could not authenticate with Twitch. Check the IGDB credentials.");
  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function request<T>(endpoint: "games" | "platforms", query: string): Promise<T[]> {
  const clientId = env.IGDB_CLIENT_ID!;
  const token = await getToken();
  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: { "Client-ID": clientId, Authorization: `Bearer ${token}`, Accept: "application/json", "content-type": "text/plain" },
    body: query,
  });
  if (!response.ok) throw new Error(response.status === 429 ? "IGDB is busy. Please wait a moment and try again." : "IGDB search is unavailable right now.");
  return await response.json() as T[];
}

function serialize(game: IgdbGame) {
  const platformOptions = [...new Map((game.platforms ?? []).filter((platform) => Number.isSafeInteger(platform.id) && platform.name).map((platform) => [platform.id, { id: platform.id, name: platform.name }])).values()];
  return {
    igdbId: game.id,
    name: game.name,
    coverUrl: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : null,
    releaseYear: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
    platforms: platformOptions.map((platform) => platform.name),
    platformOptions,
    releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10) : null,
    summary: game.summary ?? null,
    storyline: game.storyline ?? null,
    genres: (game.genres ?? []).map((genre) => genre.name),
    gameModes: (game.game_modes ?? []).map((mode) => mode.name),
    perspectives: (game.player_perspectives ?? []).map((perspective) => perspective.name),
    themes: (game.themes ?? []).map((theme) => theme.name),
    developers: (game.involved_companies ?? []).filter((entry) => entry.developer).flatMap((entry) => entry.company?.name ? [entry.company.name] : []),
    publishers: (game.involved_companies ?? []).filter((entry) => entry.publisher).flatMap((entry) => entry.company?.name ? [entry.company.name] : []),
    rating: typeof game.total_rating === "number" ? Math.round(game.total_rating) : null,
    ratingCount: game.total_rating_count ?? null,
    screenshotUrls: (game.screenshots ?? []).filter((shot) => shot.image_id).slice(0, 3).map((shot) => `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${shot.image_id}.jpg`),
  };
}

export async function searchIgdb(query: string, platformIds: number[] = []) {
  const safe = query.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const platformFilter = platformIds.length === 0 ? "" : `where platforms = (${platformIds.join(",")}); `;
  const rows = await request<IgdbGame>("games", `search "${safe}"; ${platformFilter}fields id,name,first_release_date,cover.image_id,platforms.id,platforms.name; limit 30;`);
  return rows.map(serialize);
}

export async function listIgdbPlatforms(): Promise<IgdbPlatform[]> {
  if (cachedPlatforms && cachedPlatforms.expiresAt > Date.now()) return cachedPlatforms.value;
  const platforms = await request<IgdbPlatform>("platforms", "fields id,name; sort name asc; limit 500;");
  cachedPlatforms = { value: platforms.filter((platform) => Number.isSafeInteger(platform.id) && platform.id > 0 && platform.name), expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return cachedPlatforms.value;
}

export async function getIgdbGame(id: number) {
  const rows = await request<IgdbGame>("games", `fields id,name,first_release_date,cover.image_id,platforms.id,platforms.name,summary,storyline,genres.name,game_modes.name,player_perspectives.name,themes.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,total_rating,total_rating_count,screenshots.image_id; where id = ${id}; limit 1;`);
  return rows[0] ? serialize(rows[0]) : null;
}
