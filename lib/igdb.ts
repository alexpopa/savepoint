import { env } from "cloudflare:workers";

type IgdbGame = {
  id: number;
  name: string;
  first_release_date?: number;
  cover?: { image_id?: string };
  platforms?: { name: string }[];
};

let cachedToken: { value: string; expiresAt: number } | null = null;

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

async function request(query: string): Promise<IgdbGame[]> {
  const clientId = env.IGDB_CLIENT_ID!;
  const token = await getToken();
  const response = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: { "Client-ID": clientId, Authorization: `Bearer ${token}`, Accept: "application/json", "content-type": "text/plain" },
    body: query,
  });
  if (!response.ok) throw new Error(response.status === 429 ? "IGDB is busy. Please wait a moment and try again." : "IGDB search is unavailable right now.");
  return await response.json() as IgdbGame[];
}

function serialize(game: IgdbGame) {
  return {
    igdbId: game.id,
    name: game.name,
    coverUrl: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : null,
    releaseYear: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
    platforms: (game.platforms ?? []).map((platform) => platform.name),
  };
}

export async function searchIgdb(query: string) {
  const safe = query.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const rows = await request(`search "${safe}"; fields id,name,first_release_date,cover.image_id,platforms.name; limit 30;`);
  return rows.map(serialize);
}

export async function getIgdbGame(id: number) {
  const rows = await request(`fields id,name,first_release_date,cover.image_id,platforms.name; where id = ${id}; limit 1;`);
  return rows[0] ? serialize(rows[0]) : null;
}
