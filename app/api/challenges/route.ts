import { and, eq, isNotNull } from "drizzle-orm";
import { getCurrentUser } from "../../auth";
import { getDb } from "../../../db";
import { accounts, challenges, libraryItems } from "../../../db/schema";
import { receivedChallenges, sentChallenges } from "../../../lib/challenges";
import { isSameOriginWrite } from "../../../lib/request-security";
import { ensureAccount, getFriendship, privateResponse } from "../../../lib/social";
import { hasPermission } from "../../../lib/permissions";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to view challenges." }, { status: 401 });
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope !== "received" && scope !== "sent") return Response.json({ error: "Invalid challenge scope." }, { status: 400 });
    const rows = scope === "received" ? await receivedChallenges(user.userId) : await sentChallenges(user.userId, hasPermission(user, false));
    return Response.json({ challenges: rows }, { headers: privateResponse });
  } catch { return Response.json({ error: "Challenges are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to create challenges." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const input = payload as { recipientId?: unknown; igdbId?: unknown; title?: unknown; description?: unknown } | null;
  const recipientId = typeof input?.recipientId === "string" ? input.recipientId.trim() : "";
  const igdbId = input?.igdbId;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (!recipientId || recipientId.length > 256 || recipientId === user.userId || typeof igdbId !== "number" || !Number.isSafeInteger(igdbId) || igdbId < 1 || !title || title.length > 100 || !description || description.length > 1000)
    return Response.json({ error: "Choose a friend and game, and enter a title and description (up to 100 and 1,000 characters)." }, { status: 400 });
  try {
    await ensureAccount(user);
    const [recipient] = await getDb().select({ userId: accounts.userId }).from(accounts).where(and(eq(accounts.userId, recipientId), isNotNull(accounts.passwordHash), isNotNull(accounts.emailVerifiedAt)));
    if (!recipient) return Response.json({ error: "Player not found." }, { status: 404 });
    const relation = await getFriendship(user.userId, recipientId);
    if (!hasPermission(user, relation?.status === "accepted")) return Response.json({ error: "Only friends can create challenges for each other." }, { status: 403 });
    const [game] = await getDb().select().from(libraryItems).where(and(eq(libraryItems.userId, recipientId), eq(libraryItems.igdbId, igdbId)));
    if (!game) return Response.json({ error: "That game is no longer in your friend's library." }, { status: 409 });
    const now = Date.now();
    const [created] = await getDb().insert(challenges).values({
      recipientId,
      creatorId: user.userId,
      igdbId,
      gameName: game.name,
      gameCoverUrl: game.coverUrl,
      title,
      description,
      createdAt: now,
      timelineAt: now,
    }).returning({ id: challenges.id });
    await getDb().update(challenges).set({ sortOrder: created.id }).where(eq(challenges.id, created.id));
    return Response.json({ id: created.id }, { status: 201, headers: privateResponse });
  } catch { return Response.json({ error: "Could not create the challenge." }, { status: 503 }); }
}
