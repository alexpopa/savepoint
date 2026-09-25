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
const cachedGameCovers = new Map<number, { coverUrl: string | null; catalogIgdbId: number; expiresAt: number }>();
const recentCoverRefreshes = new Map<number, { result: { found: true; coverUrl: string | null; catalogIgdbId: number } | { found: false }; expiresAt: number }>();

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

type GameCoverReference = { igdbId: number; name: string; releaseYear: number | null };
type IgdbCoverGame = Pick<IgdbGame, "id" | "name" | "first_release_date" | "cover">;

function gameCoverUrl(game: Pick<IgdbGame, "cover">) {
  return game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : null;
}

function normalizedGameName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function matchesSavedGame(reference: GameCoverReference, game: IgdbCoverGame) {
  if (normalizedGameName(reference.name) !== normalizedGameName(game.name)) return false;
  if (reference.releaseYear && game.first_release_date) return new Date(game.first_release_date * 1000).getUTCFullYear() === reference.releaseYear;
  return true;
}

async function findIgdbGamesByTitle(references: GameCoverReference[]) {
  const titles = [...new Map(references
    .filter((reference) => reference.name.length > 0 && reference.name.length <= 200 && !/[\r\n]/.test(reference.name))
    .map((reference) => [normalizedGameName(reference.name), reference.name] as const)).entries()];
  const rowsByName = new Map<string, IgdbCoverGame[]>();

  for (let offset = 0; offset < titles.length; offset += 10) {
    const batch = titles.slice(offset, offset + 10);
    const filters = batch.map(([, name]) => `name = "${name.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(" | ");
    try {
      const rows = await request<IgdbCoverGame>("games", `fields id,name,first_release_date,cover.image_id; where (${filters}); limit 500;`);
      for (const row of rows) {
        const key = normalizedGameName(row.name);
        rowsByName.set(key, [...(rowsByName.get(key) ?? []), row]);
      }
    } catch {
      // A title lookup is a best-effort recovery for legacy rows.
    }
  }

  const matches = new Map<number, IgdbCoverGame>();
  for (const reference of references) {
    const candidates = (rowsByName.get(normalizedGameName(reference.name)) ?? []).filter((game) => matchesSavedGame(reference, game));
    const withCovers = candidates.filter((game) => game.cover?.image_id);
    const exactYear = reference.releaseYear ? withCovers.filter((game) => game.first_release_date && new Date(game.first_release_date * 1000).getUTCFullYear() === reference.releaseYear) : [];
    const undatedUnique = candidates.length === 1 && !candidates[0].first_release_date ? candidates[0] : undefined;
    const match = exactYear[0] ?? undatedUnique ?? (!reference.releaseYear && withCovers.length === 1 ? withCovers[0] : undefined);
    if (match) matches.set(reference.igdbId, match);
  }
  return matches;
}

export async function getIgdbGameCoversForGames(references: GameCoverReference[]) {
  const now = Date.now();
  for (const [id, cached] of cachedGameCovers) {
    if (cached.expiresAt <= now) cachedGameCovers.delete(id);
  }

  const uniqueReferences = [...new Map(references.filter((game) => Number.isSafeInteger(game.igdbId) && game.igdbId > 0).map((game) => [game.igdbId, game] as const)).values()];
  const result = new Map<number, { catalogIgdbId: number; coverUrl: string | null }>();
  const needsLookup: GameCoverReference[] = [];
  for (const reference of uniqueReferences) {
    const cached = cachedGameCovers.get(reference.igdbId);
    if (cached) result.set(reference.igdbId, { catalogIgdbId: cached.catalogIgdbId, coverUrl: cached.coverUrl });
    else needsLookup.push(reference);
  }

  const rowsById = new Map<number, IgdbCoverGame>();
  for (let offset = 0; offset < needsLookup.length; offset += 500) {
    const batch = needsLookup.slice(offset, offset + 500);
    try {
      const rows = await request<IgdbCoverGame>("games", `fields id,name,first_release_date,cover.image_id; where id = (${batch.map((item) => item.igdbId).join(",")}); limit ${batch.length};`);
      for (const row of rows) rowsById.set(row.id, row);
    } catch {
      // The exact-title fallback below can still resolve legacy IDs.
    }
  }

  const unresolved: GameCoverReference[] = [];
  for (const reference of needsLookup) {
    const byId = rowsById.get(reference.igdbId);
    if (byId && matchesSavedGame(reference, byId) && gameCoverUrl(byId)) {
      const resolved = { catalogIgdbId: byId.id, coverUrl: gameCoverUrl(byId) };
      result.set(reference.igdbId, resolved);
      cachedGameCovers.set(reference.igdbId, { ...resolved, expiresAt: now + 24 * 60 * 60 * 1000 });
    } else {
      unresolved.push(reference);
    }
  }

  const titleMatches = await findIgdbGamesByTitle(unresolved);
  for (const reference of unresolved) {
    const byTitle = titleMatches.get(reference.igdbId);
    const byId = rowsById.get(reference.igdbId);
    const resolved = byTitle
      ? { catalogIgdbId: byTitle.id, coverUrl: gameCoverUrl(byTitle) }
      : { catalogIgdbId: byId && matchesSavedGame(reference, byId) ? byId.id : reference.igdbId, coverUrl: null };
    result.set(reference.igdbId, resolved);
    cachedGameCovers.set(reference.igdbId, { ...resolved, expiresAt: now + (resolved.coverUrl ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000) });
  }

  while (cachedGameCovers.size > 2_000) {
    const oldestId = cachedGameCovers.keys().next().value;
    if (oldestId === undefined) break;
    cachedGameCovers.delete(oldestId);
  }
  return result;
}

export async function refreshIgdbGameCover(id: number, fallback?: Omit<GameCoverReference, "igdbId">) {
  const now = Date.now();
  for (const [cachedId, cached] of recentCoverRefreshes) {
    if (cached.expiresAt <= now) recentCoverRefreshes.delete(cachedId);
  }

  const recent = recentCoverRefreshes.get(id);
  if (recent) return recent.result;

  const rows = await request<IgdbCoverGame>("games", `fields id,name,first_release_date,cover.image_id; where id = ${id}; limit 1;`);
  const byId = rows[0] && (!fallback || matchesSavedGame({ igdbId: id, ...fallback }, rows[0])) ? rows[0] : undefined;
  const byTitle = fallback && (!byId || !gameCoverUrl(byId))
    ? (await findIgdbGamesByTitle([{ igdbId: id, ...fallback }])).get(id)
    : undefined;
  const current = byTitle ?? byId;
  const result = current ? { found: true as const, coverUrl: gameCoverUrl(current), catalogIgdbId: current.id } : { found: false as const };
  recentCoverRefreshes.set(id, { result, expiresAt: now + 10 * 60 * 1000 });
  if (result.found) cachedGameCovers.set(id, { catalogIgdbId: current.id, coverUrl: result.coverUrl, expiresAt: now + (result.coverUrl ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000) });

  while (recentCoverRefreshes.size > 500) {
    const oldestId = recentCoverRefreshes.keys().next().value;
    if (oldestId === undefined) break;
    recentCoverRefreshes.delete(oldestId);
  }

  return result;
}
