import { eq, inArray, sql } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { challenges } from "../../../../db/schema";
import { isComplete, receivedChallenges } from "../../../../lib/challenges";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

type Context = { params: Promise<{ id: string }> };
type Action = "confirm" | "unconfirm" | "decline" | "favorite" | "unfavorite" | "move_up" | "move_down";

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to update challenges." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid challenge." }, { status: 400 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const action = (payload as { action?: unknown } | null)?.action;
  if (!["confirm", "unconfirm", "decline", "favorite", "unfavorite", "move_up", "move_down"].includes(action as string))
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
      case "unconfirm":
        await db.update(challenges).set(isRecipient ? { recipientConfirmed: action === "confirm" } : { creatorConfirmed: action === "confirm" }).where(eq(challenges.id, id));
        break;
      case "decline":
        if (!isRecipient) return Response.json({ error: "Only the recipient can remove a challenge." }, { status: 403 });
        await db.update(challenges).set({ declinedAt: Date.now(), isFavorite: false }).where(eq(challenges.id, id));
        break;
      case "favorite":
      case "unfavorite":
        if (!isRecipient) return Response.json({ error: "Only the recipient can rank challenges." }, { status: 403 });
        await db.update(challenges).set({ isFavorite: action === "favorite" }).where(eq(challenges.id, id));
        break;
      case "move_up":
      case "move_down": {
        if (!isRecipient) return Response.json({ error: "Only the recipient can rank challenges." }, { status: 403 });
        const all = await receivedChallenges(user.userId);
        const current = all.find((item) => item.id === id);
        if (!current) return Response.json({ error: "Challenge not found." }, { status: 404 });
        const peers = all.filter((item) => isComplete(item) === isComplete(current) && item.isFavorite === current.isFavorite);
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
