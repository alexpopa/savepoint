import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { libraryItems } from "../../../../db/schema";
import { getIgdbGame } from "../../../../lib/igdb";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { hasPermission } from "../../../../lib/permissions";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to remove games." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid library item." }, { status: 400 });
  try {
    await getDb().delete(libraryItems).where(and(eq(libraryItems.id, id), ...(hasPermission(user, false) ? [] : [eq(libraryItems.userId, user.userId)])));
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "Could not remove the game." }, { status: 503 }); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to edit games." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid library item." }, { status: 400 });
  try {
    const payload = await request.json() as { platformId?: unknown };
    if (typeof payload?.platformId !== "number" || !Number.isSafeInteger(payload.platformId) || payload.platformId < 1)
      return Response.json({ error: "Choose a valid platform." }, { status: 400 });
    const db = getDb();
    const [item] = await db.select().from(libraryItems).where(and(eq(libraryItems.id, id), ...(hasPermission(user, false) ? [] : [eq(libraryItems.userId, user.userId)])));
    if (!item) return Response.json({ error: "This game is no longer in your library." }, { status: 404 });
    const game = await getIgdbGame(item.igdbId);
    if (!game) return Response.json({ error: "That game is not available in IGDB." }, { status: 404 });
    const platform = game.platformOptions.find((option) => option.id === payload.platformId);
    if (!platform) return Response.json({ error: "Choose an available platform for this game." }, { status: 400 });
    const [existing] = await db.select({ id: libraryItems.id }).from(libraryItems).where(and(eq(libraryItems.userId, item.userId), eq(libraryItems.igdbId, item.igdbId), eq(libraryItems.platformId, platform.id)));
    if (existing && existing.id !== id) return Response.json({ error: "This platform is already in your library." }, { status: 409 });
    await db.update(libraryItems).set({ platformId: platform.id, platformName: platform.name, platformsJson: JSON.stringify(game.platforms) }).where(and(eq(libraryItems.id, id), eq(libraryItems.userId, item.userId)));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(error.message))
      return Response.json({ error: "This platform is already in your library." }, { status: 409 });
    return Response.json({ error: "Could not edit the platform." }, { status: 503 });
  }
}
