import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { libraryItems } from "../../../db/schema";
import { getIgdbGame } from "../../../lib/igdb";
import { isSameOriginWrite } from "../../../lib/request-security";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to view your library." }, { status: 401 });
  try {
    const rows = await getDb().select().from(libraryItems).where(eq(libraryItems.userId, user.userId)).orderBy(desc(libraryItems.addedAt));
    return Response.json({ games: rows.map((row) => ({ id: row.id, igdbId: row.igdbId, name: row.name, coverUrl: row.coverUrl, releaseYear: row.releaseYear, platforms: JSON.parse(row.platformsJson) as string[] })) }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ error: "Your library is temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to add games." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const payload = await request.json() as { igdbId?: number };
    const igdbId = Number(payload.igdbId);
    if (!Number.isSafeInteger(igdbId) || igdbId < 1) return Response.json({ error: "Choose a valid game from IGDB." }, { status: 400 });
    const game = await getIgdbGame(igdbId);
    if (!game) return Response.json({ error: "That game is not available in IGDB." }, { status: 404 });
    await getDb().insert(libraryItems).values({ userId: user.userId, igdbId: game.igdbId, name: game.name, coverUrl: game.coverUrl, releaseYear: game.releaseYear, platformsJson: JSON.stringify(game.platforms), addedAt: Date.now() }).onConflictDoNothing();
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not add the game." }, { status: 503 });
  }
}
