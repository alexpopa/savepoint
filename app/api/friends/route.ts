import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { accounts, friendships } from "../../../db/schema";
import { isSameOriginWrite } from "../../../lib/request-security";
import { ensureAccount, getSocialState, pairFor, privateResponse } from "../../../lib/social";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to view friends." }, { status: 401 });
  try {
    await ensureAccount(user);
    return Response.json({ people: await getSocialState(user.userId) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Friends are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to send friend requests." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const email = typeof (payload as { email?: unknown } | null)?.email === "string"
    ? (payload as { email: string }).email.trim().toLowerCase() : "";
  const targetId = typeof (payload as { userId?: unknown } | null)?.userId === "string"
    ? (payload as { userId: string }).userId.trim() : "";
  if (targetId ? targetId.length > 256 : !email || email.length > 320 || !email.includes("@"))
    return Response.json({ error: "Choose a valid player or enter an email address." }, { status: 400 });
  try {
    await ensureAccount(user);
    const db = getDb();
    const [target] = await db.select().from(accounts).where(targetId ? eq(accounts.userId, targetId) : eq(accounts.email, email));
    if (!target) return Response.json({ error: "No Savepoint account was found." }, { status: 404 });
    if (target.userId === user.userId) return Response.json({ error: "You cannot send yourself a friend request." }, { status: 400 });
    const result = await db.insert(friendships).values({ ...pairFor(user.userId, target.userId), requesterId: user.userId, status: "pending", createdAt: Date.now() }).onConflictDoNothing().returning();
    if (!result.length) return Response.json({ error: "A friend request or friendship already exists." }, { status: 409 });
    return Response.json({ ok: true }, { status: 201, headers: privateResponse });
  } catch { return Response.json({ error: "Could not send the friend request." }, { status: 503 }); }
}
