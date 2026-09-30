import { and, eq, sql } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { challenges } from "../../../../db/schema";
import { awardHonor, honorLimit, placeHonor } from "../../../../lib/challenge-queries";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";
import { confirmationParticipant, hasPermission } from "../../../../lib/permissions";

type Context = { params: Promise<{ id: string }> };
type Action = "confirm" | "unconfirm" | "favorite" | "unfavorite" | "place";

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to update challenges." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid challenge." }, { status: 400 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const action = (payload as { action?: unknown } | null)?.action;
  if (!["confirm", "unconfirm", "favorite", "unfavorite", "place"].includes(action as string))
    return Response.json({ error: "Invalid challenge action." }, { status: 400 });
  const position = (payload as { position?: unknown }).position;
  if (action === "place" && (!Number.isSafeInteger(position) || (position as number) < 1 || (position as number) > honorLimit))
    return Response.json({ error: `Choose a Hall of Honor position from 1 to ${honorLimit}.` }, { status: 400 });
  try {
    const db = getDb();
    const [row] = await db.select().from(challenges).where(eq(challenges.id, id));
    if (!row) return Response.json({ error: "Challenge not found." }, { status: 404 });
    const isRecipient = row.recipientId === user.userId;
    const isCreator = row.creatorId === user.userId;
    if (!hasPermission(user, isRecipient || isCreator)) return Response.json({ error: "Only the two participants can update this challenge." }, { status: 403 });
    if (row.declinedAt !== null) return Response.json({ error: "This challenge was declined." }, { status: 409 });
    switch (action as Action) {
      case "confirm":
      case "unconfirm": {
        const confirmed = action === "confirm";
        const participant = confirmationParticipant(user, row, (payload as { participant?: unknown }).participant);
        if (!participant) return Response.json({ error: "You cannot change that participant's confirmation." }, { status: 403 });
        // Evaluate against the stored flags in the same UPDATE, including concurrent confirmations.
        const changesVisibleState = participant === "recipient"
          ? sql`${challenges.recipientConfirmed} <> ${confirmed}`
          : sql`${challenges.recipientConfirmed} = 1 AND ${challenges.creatorConfirmed} <> ${confirmed}`;
        await db.update(challenges).set({
          ...(participant === "recipient" ? { recipientConfirmed: confirmed } : { creatorConfirmed: confirmed }),
          timelineAt: sql`CASE WHEN ${changesVisibleState} THEN ${Date.now()} ELSE ${challenges.timelineAt} END`,
        }).where(eq(challenges.id, id));
        break;
      }
      case "favorite":
        if (!hasPermission(user, isRecipient)) return Response.json({ error: "Only the recipient can add challenges to their Hall of Honor." }, { status: 403 });
        if (row.isFavorite) break;
        if (!row.creatorConfirmed || !row.recipientConfirmed) return Response.json({ error: "Complete this challenge before adding it to the Hall of Honor." }, { status: 409 });
        if (!(await db.$client.prepare(awardHonor).bind(row.recipientId, id).run()).meta.changes)
          return Response.json({ error: `The Hall of Honor holds ${honorLimit} challenges. Remove one to add another.` }, { status: 409 });
        break;
      case "unfavorite":
        if (!hasPermission(user, isRecipient)) return Response.json({ error: "Only the recipient can remove challenges from their Hall of Honor." }, { status: 403 });
        await db.update(challenges).set({ isFavorite: false }).where(eq(challenges.id, id));
        break;
      case "place":
        if (!hasPermission(user, isRecipient)) return Response.json({ error: "Only the recipient can rank challenges." }, { status: 403 });
        if (!row.isFavorite || !row.creatorConfirmed || !row.recipientConfirmed) return Response.json({ error: "Only challenges in the Hall of Honor can be ranked." }, { status: 409 });
        await db.$client.prepare(placeHonor).bind(row.recipientId, id, position).run();
        break;
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
    if (!hasPermission(user, row.recipientId === user.userId))
      return Response.json({ error: "Only the challenged player can remove this challenge." }, { status: 403 });
    const [deleted] = await db.delete(challenges).where(and(
      eq(challenges.id, id),
      ...(hasPermission(user, false) ? [] : [eq(challenges.recipientId, user.userId)]),
    )).returning({ id: challenges.id });
    if (!deleted) return Response.json({ error: "This challenge changed before it could be deleted." }, { status: 409 });
    return Response.json({ ok: true }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not delete the challenge." }, { status: 503 }); }
}
