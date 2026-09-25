import { and, eq, isNull, or } from "drizzle-orm";
import { getCurrentUser } from "../../../../../auth";
import { getDb } from "../../../../../../db";
import { libraryItems } from "../../../../../../db/schema";
import { refreshIgdbGameCover } from "../../../../../../lib/igdb";
import { isSameOriginWrite } from "../../../../../../lib/request-security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to refresh game artwork." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid game." }, { status: 400 });

  let failedCoverUrl: string;
  try {
    const payload = await request.json() as { failedCoverUrl?: unknown };
    if (typeof payload?.failedCoverUrl !== "string" || payload.failedCoverUrl.length > 500) throw new Error();
    const url = new URL(payload.failedCoverUrl);
    if (url.protocol !== "https:" || url.hostname !== "images.igdb.com" || !url.pathname.startsWith("/igdb/image/upload/")) throw new Error();
    failedCoverUrl = url.toString();
  } catch {
    return Response.json({ error: "Invalid failed cover URL." }, { status: 400 });
  }

  try {
    const db = getDb();
    const [savedGame] = await db.select({ name: libraryItems.name, releaseYear: libraryItems.releaseYear }).from(libraryItems).where(eq(libraryItems.igdbId, id)).limit(1);
    const current = await refreshIgdbGameCover(id, savedGame ? { name: savedGame.name, releaseYear: savedGame.releaseYear } : undefined);
    if (!current.found) return Response.json({ error: "Game not found in IGDB." }, { status: 404 });

    await db.update(libraryItems).set({ coverUrl: current.coverUrl }).where(and(
      eq(libraryItems.igdbId, id),
      or(eq(libraryItems.coverUrl, failedCoverUrl), isNull(libraryItems.coverUrl)),
    ));
    return Response.json({ coverUrl: current.coverUrl, catalogIgdbId: current.catalogIgdbId }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not refresh game artwork." }, { status: 503 });
  }
}
