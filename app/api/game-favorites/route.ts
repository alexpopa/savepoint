import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "../../auth";
import { getDb } from "../../../db";
import { gameFavorites } from "../../../db/schema";
import { getGameFavorites } from "../../../lib/game-favorites";
import { insertGameFavorite } from "../../../lib/game-favorite-queries";
import { getIgdbGame } from "../../../lib/igdb";
import { isSameOriginWrite } from "../../../lib/request-security";
import { privateResponse } from "../../../lib/social";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to see your favorites." }, { status: 401 });
  try {
    return Response.json({ favorites: await getGameFavorites(user.userId) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not load favorite games." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to favorite games." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const igdbId = (payload as { igdbId?: unknown } | null)?.igdbId;
  if (typeof igdbId !== "number" || !Number.isSafeInteger(igdbId) || igdbId < 1)
    return Response.json({ error: "Choose a valid game." }, { status: 400 });
  try {
    const db = getDb();
    const existing = await db.select().from(gameFavorites).where(and(eq(gameFavorites.userId, user.userId), eq(gameFavorites.igdbId, igdbId)));
    if (!existing.length) {
      const game = await getIgdbGame(igdbId);
      if (!game) return Response.json({ error: "That game is not available in IGDB." }, { status: 404 });
      await db.$client.prepare(insertGameFavorite).bind(user.userId, game.igdbId, game.name, game.coverUrl, game.releaseYear, Date.now()).run();
    }
    const favorites = await getGameFavorites(user.userId);
    if (!favorites.some((game) => game.igdbId === igdbId))
      return Response.json({ error: "You can favorite up to 9 games. Remove a favorite to make room." }, { status: 409 });
    return Response.json({ favorites }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not favorite this game. Please try again." }, { status: 503 }); }
}
