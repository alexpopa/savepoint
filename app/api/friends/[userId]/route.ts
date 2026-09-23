import { and, eq, ne } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { friendships } from "../../../../db/schema";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { pairWhere, privateResponse } from "../../../../lib/social";

type Context = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to manage friend requests." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const targetId = (await context.params).userId;
  if (!targetId || targetId === user.userId) return Response.json({ error: "Invalid account." }, { status: 400 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if ((payload as { action?: unknown } | null)?.action !== "accept") return Response.json({ error: "Invalid friend request action." }, { status: 400 });
  try {
    const updated = await getDb().update(friendships).set({ status: "accepted" }).where(and(
      pairWhere(user.userId, targetId),
      eq(friendships.status, "pending"),
      ne(friendships.requesterId, user.userId),
    )).returning();
    if (!updated.length) return Response.json({ error: "No incoming friend request was found." }, { status: 404 });
    return Response.json({ ok: true }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not accept the friend request." }, { status: 503 }); }
}

export async function DELETE(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to manage friends." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const targetId = (await context.params).userId;
  if (!targetId || targetId === user.userId) return Response.json({ error: "Invalid account." }, { status: 400 });
  try {
    const deleted = await getDb().delete(friendships).where(pairWhere(user.userId, targetId)).returning();
    if (!deleted.length) return Response.json({ error: "No request or friendship was found." }, { status: 404 });
    return Response.json({ ok: true }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not update friends." }, { status: 503 }); }
}
