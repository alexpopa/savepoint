import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { accounts, friendships } from "../../../../db/schema";
import { accountDisplayName, ensureAccount, privateResponse } from "../../../../lib/social";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 100) return Response.json({ error: "Search must be between 2 and 100 characters." }, { status: 400 });
  try {
    if (user) await ensureAccount(user);
    const db = getDb();
    const match = query.toLowerCase();
    const rows = await db.select({ userId: accounts.userId, displayName: accounts.displayName, email: accounts.email, isPublic: accounts.isPublic })
      .from(accounts)
      .where(and(isNotNull(accounts.passwordHash), isNotNull(accounts.emailVerifiedAt), ...(user ? [ne(accounts.userId, user.userId)] : []), or(
        sql`instr(lower(${accounts.displayName}), ${match}) > 0`,
        ...(user ? [sql`instr(lower(${accounts.email}), ${match}) > 0`] : []),
      )))
      .orderBy(accounts.displayName)
      .limit(30);
    const ids = rows.map((row) => row.userId);
    const relations = user && ids.length ? await db.select().from(friendships).where(or(
      and(eq(friendships.userLow, user.userId), inArray(friendships.userHigh, ids)),
      and(eq(friendships.userHigh, user.userId), inArray(friendships.userLow, ids)),
    )) : [];
    const byId = new Map(relations.map((row) => [row.userLow === user?.userId ? row.userHigh : row.userLow, row]));
    return Response.json({ players: rows.map((row) => {
      const relation = byId.get(row.userId);
      return { userId: row.userId, displayName: accountDisplayName(row), isPublic: row.isPublic,
        relationship: relation ? { status: relation.status, direction: relation.requesterId === user?.userId ? "outgoing" : "incoming" } : null };
    }) }, { headers: privateResponse });
  } catch {
    return Response.json({ error: "Player search is temporarily unavailable." }, { status: 503, headers: privateResponse });
  }
}
