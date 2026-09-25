import { and, eq, inArray, sql } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { challenges } from "../../../../db/schema";
import { isComplete, receivedChallenges } from "../../../../lib/challenges";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

type Context = { params: Promise<{ id: string }> };
type Action = "confirm" | "unconfirm" | "favorite" | "unfavorite" | "move_up" | "move_down";

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to update challenges." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid challenge." }, { status: 400 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const action = (payload as { action?: unknown } | null)?.action;
  if (!["confirm", "unconfirm", "favorite", "unfavorite", "move_up", "move_down"].includes(action as string))
    return Response.json({ error: "Invalid challenge action." }, { status: 400 });
  try {
    const db = getDb();
    const [row] = await db.select().from(challenges).where(eq(challenges.id, id));
    if (!row) return Response.json({ error: "Challenge not found." }, { status: 404 });
    const isRecipient = row.recipientId === user.userId;
    const isCreator = row.creatorId === user.userId;
    if (!isRecipient && !isCreator) return Response.json({ error: "Only the two participants can update this challenge." }, { status: 403 });
    if (row.declinedAt !== null) return Response.json({ error: "This challenge was declined." }, { status: 409 });
    switch (action as Action) {
      case "confirm":
      case "unconfirm": {
        const confirmed = action === "confirm";
        // Evaluate against the stored flags in the same UPDATE, including concurrent confirmations.
        const changesVisibleState = isRecipient
          ? sql`${challenges.recipientConfirmed} <> ${confirmed}`
          : sql`${challenges.recipientConfirmed} = 1 AND ${challenges.creatorConfirmed} <> ${confirmed}`;
        await db.update(challenges).set({
          ...(isRecipient ? { recipientConfirmed: confirmed } : { creatorConfirmed: confirmed }),
          timelineAt: sql`CASE WHEN ${changesVisibleState} THEN ${Date.now()} ELSE ${challenges.timelineAt} END`,
        }).where(eq(challenges.id, id));
        break;
      }
      case "favorite":
      case "unfavorite":
        if (!isRecipient) return Response.json({ error: "Only the recipient can favorite challenges." }, { status: 403 });
        await db.update(challenges).set({ isFavorite: action === "favorite" }).where(eq(challenges.id, id));
        break;
      case "move_up":
      case "move_down": {
        if (!isRecipient) return Response.json({ error: "Only the recipient can rank challenges." }, { status: 403 });
        const all = await receivedChallenges(user.userId);
        const current = all.find((item) => item.id === id);
        if (!current) return Response.json({ error: "Challenge not found." }, { status: 404 });
        if (!current.isFavorite) return Response.json({ error: "Favorite this challenge before ranking it." }, { status: 409 });
        const peers = all.filter((item) => item.isFavorite && isComplete(item) === isComplete(current));
        const index = peers.findIndex((item) => item.id === id);
        const other = peers[index + (action === "move_up" ? -1 : 1)];
        if (!other) return Response.json({ ok: true }, { headers: privateResponse });
        await db.update(challenges).set({ sortOrder: sql`CASE WHEN ${challenges.id} = ${id} THEN ${other.sortOrder} ELSE ${current.sortOrder} END` }).where(inArray(challenges.id, [id, other.id]));
        break;
      }
    }
    return Response.json({ ok: true }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not update the challenge." }, { status: 503 }); }
}

export async function DELETE(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to delete challenges." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid challenge." }, { status: 400 });
  try {
    const db = getDb();
    const [row] = await db.select().from(challenges).where(eq(challenges.id, id));
    if (!row) return Response.json({ error: "Challenge not found." }, { status: 404 });
    if (row.recipientId !== user.userId)
      return Response.json({ error: "Only the challenged player can remove this challenge." }, { status: 403 });
    const [deleted] = await db.delete(challenges).where(and(
      eq(challenges.id, id),
      eq(challenges.recipientId, user.userId),
    )).returning({ id: challenges.id });
    if (!deleted) return Response.json({ error: "This challenge changed before it could be deleted." }, { status: 409 });
    return Response.json({ ok: true }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not delete the challenge." }, { status: 503 }); }
}
