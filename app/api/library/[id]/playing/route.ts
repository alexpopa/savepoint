import { eq } from "drizzle-orm";
import { getCurrentUser } from "../../../../auth";
import { getDb } from "../../../../../db";
import { libraryItems } from "../../../../../db/schema";
import { getCurrentlyPlaying } from "../../../../../lib/currently-playing";
import { startPlaying, stopPlaying } from "../../../../../lib/currently-playing-queries";
import { hasPermission } from "../../../../../lib/permissions";
import { isSameOriginWrite } from "../../../../../lib/request-security";
import { privateResponse } from "../../../../../lib/social";

type Context = { params: Promise<{ id: string }> };
async function update(request: Request, context: Context, playing: boolean) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to update currently playing." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid library item." }, { status: 400 });
  try {
    const db = getDb();
    // Only a saved platform copy can be marked, so owning the game is enforced by the row itself.
    const [row] = await db.select({ userId: libraryItems.userId }).from(libraryItems).where(eq(libraryItems.id, id));
    if (!row) return Response.json({ error: "This platform copy is no longer in the library." }, { status: 404 });
    if (!hasPermission(user, row.userId === user.userId)) return Response.json({ error: "You cannot update this game." }, { status: 403 });
    await db.$client.prepare(playing ? startPlaying : stopPlaying).bind(id, row.userId, ...(playing ? [Date.now()] : [])).run();
    return Response.json({ playing: await getCurrentlyPlaying(row.userId) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not update currently playing. Please try again." }, { status: 503 }); }
}
export const PUT = (request: Request, context: Context) => update(request, context, true);
export const DELETE = (request: Request, context: Context) => update(request, context, false);
