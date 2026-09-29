import { eq } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { gameFavorites } from "../../../../db/schema";
import { getGameFavorites } from "../../../../lib/game-favorites";
import { favoriteLimit, placeGameFavorite } from "../../../../lib/game-favorite-queries";
import { hasPermission } from "../../../../lib/permissions";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

type Context = { params: Promise<{ id: string }> };
async function update(request: Request, context: Context, remove: boolean) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to update favorites." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid favorite." }, { status: 400 });
  let position: unknown;
  if (!remove) {
    try { position = (await request.json() as { position?: unknown } | null)?.position; }
    catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
    if (!Number.isSafeInteger(position) || (position as number) < 1 || (position as number) > favoriteLimit) return Response.json({ error: `Choose a Top 10 position from 1 to ${favoriteLimit}.` }, { status: 400 });
  }
  try {
    const db = getDb();
    const [row] = await db.select().from(gameFavorites).where(eq(gameFavorites.id, id));
    if (!row) return Response.json({ error: "Favorite not found." }, { status: 404 });
    if (!hasPermission(user, row.userId === user.userId)) return Response.json({ error: "You cannot update this favorite." }, { status: 403 });
    if (remove) await db.$client.prepare("DELETE FROM game_favorites WHERE id = ? AND user_id = ?").bind(id, row.userId).run();
    else await db.$client.prepare(placeGameFavorite).bind(row.userId, id, position).run();
    return Response.json({ favorites: await getGameFavorites(row.userId) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not update favorite games." }, { status: 503 }); }
}
export const PATCH = (request: Request, context: Context) => update(request, context, false);
export const DELETE = (request: Request, context: Context) => update(request, context, true);
