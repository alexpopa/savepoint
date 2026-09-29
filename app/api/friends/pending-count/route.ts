import { and, count, eq, ne, or } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { friendships } from "../../../../db/schema";
import { privateResponse } from "../../../../lib/social";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to view pending friend requests." }, { status: 401 });
  try {
    const [result] = await getDb().select({ count: count() }).from(friendships).where(and(
      eq(friendships.status, "pending"),
      ne(friendships.requesterId, user.userId),
      or(eq(friendships.userLow, user.userId), eq(friendships.userHigh, user.userId)),
    ));
    return Response.json({ count: result?.count ?? 0 }, { headers: privateResponse });
  } catch { return Response.json({ error: "Pending friend requests are temporarily unavailable." }, { status: 503 }); }
}
