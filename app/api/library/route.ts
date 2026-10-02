import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "../../auth";
import { getDb } from "../../../db";
import { libraryItems } from "../../../db/schema";
import { getIgdbGame } from "../../../lib/igdb";
import { isSameOriginWrite } from "../../../lib/request-security";
import { ensureAccount, getLibraryGames } from "../../../lib/social";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to view your library." }, { status: 401 });
  try {
    await ensureAccount(user);
    return Response.json({ games: await getLibraryGames(user.userId) }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ error: "Your library is temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to add games." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    await ensureAccount(user);
    const payload = await request.json() as { igdbId?: unknown; platformId?: unknown };
    const igdbId = payload?.igdbId;
    if (typeof igdbId !== "number" || !Number.isSafeInteger(igdbId) || igdbId < 1) return Response.json({ error: "Choose a valid game from IGDB." }, { status: 400 });
    const game = await getIgdbGame(igdbId);
    if (!game) return Response.json({ error: "That game is not available in IGDB." }, { status: 404 });
    const requested = payload.platformId;
    const platformId = game.platformOptions.length === 0 && requested === undefined ? 0 : game.platformOptions.length === 1 && requested === undefined ? game.platformOptions[0].id : requested;
    if (typeof platformId !== "number" || !Number.isSafeInteger(platformId) || (platformId !== 0 && !game.platformOptions.some((platform) => platform.id === platformId)) || (platformId === 0 && game.platformOptions.length > 0))
      return Response.json({ error: "Choose an available platform for this game." }, { status: 400 });
    const platformName = game.platformOptions.find((platform) => platform.id === platformId)?.name ?? "Platform not listed";
    const db = getDb();
    const [existing] = await db.select({ id: libraryItems.id }).from(libraryItems).where(and(eq(libraryItems.userId, user.userId), eq(libraryItems.igdbId, igdbId), eq(libraryItems.platformId, platformId)));
    if (existing) return Response.json({ error: "This platform is already in your library." }, { status: 409 });
    const now = Date.now();
    const [inserted] = await db.insert(libraryItems).values({ userId: user.userId, igdbId: game.igdbId, name: game.name, coverUrl: game.coverUrl, releaseYear: game.releaseYear, platformsJson: JSON.stringify(game.platforms), platformId, platformName, addedAt: now, updatedAt: now }).onConflictDoNothing().returning({ id: libraryItems.id });
    if (!inserted) return Response.json({ error: "This platform is already in your library." }, { status: 409 });
    await db.update(libraryItems).set({ updatedAt: now }).where(and(eq(libraryItems.userId, user.userId), eq(libraryItems.igdbId, igdbId)));
    return Response.json({ ok: true, id: inserted.id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not add the game." }, { status: 503 });
  }
}
