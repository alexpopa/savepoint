import { eq, sql } from "drizzle-orm";
import { getCurrentUser } from "../../../../auth";
import { getDb } from "../../../../../db";
import { libraryItems } from "../../../../../db/schema";
import { hasPermission } from "../../../../../lib/permissions";
import { maxPlayMinutes, readPlaytime } from "../../../../../lib/playtime";
import { manualEventMinutes, setPlaytime, sourceMinutes, sourceNames } from "../../../../../lib/playtime-queries";
import { isSameOriginWrite } from "../../../../../lib/request-security";
import { privateResponse } from "../../../../../lib/social";

type Context = { params: Promise<{ id: string }> };

// Sets the player's own time played for one platform copy; null follows the connected services again.
export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to update time played." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid library item." }, { status: 400 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const minutes = (payload as { minutes?: unknown } | null)?.minutes;
  if (minutes !== null && (typeof minutes !== "number" || !Number.isSafeInteger(minutes) || minutes < 0 || minutes > maxPlayMinutes))
    return Response.json({ error: "Enter hours played between 0 and 100,000." }, { status: 400 });
  try {
    const db = getDb();
    const [row] = await db.select({ userId: libraryItems.userId }).from(libraryItems).where(eq(libraryItems.id, id));
    if (!row) return Response.json({ error: "This platform copy is no longer in the library." }, { status: 404 });
    if (!hasPermission(user, row.userId === user.userId)) return Response.json({ error: "You cannot update this game." }, { status: 403 });
    await db.$client.prepare(setPlaytime).bind(id, row.userId, minutes).run();
    const [updated] = await db.select({ own: libraryItems.playMinutes, sourceMinutes: sql<number | null>`${sql.raw(sourceMinutes("library_items"))}`,
      sourceNames: sql<string | null>`${sql.raw(sourceNames("library_items"))}`, eventMinutes: sql<number>`${sql.raw(manualEventMinutes("library_items"))}` }).from(libraryItems).where(eq(libraryItems.id, id));
    if (!updated) return Response.json({ error: "This platform copy is no longer in the library." }, { status: 404 });
    return Response.json({ playtime: readPlaytime(updated.own, updated.sourceMinutes, updated.sourceNames, updated.eventMinutes) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not update time played. Please try again." }, { status: 503 }); }
}
