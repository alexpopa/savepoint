import { and, eq, isNotNull } from "drizzle-orm";
import { normalizedEmail } from "../../../auth";
import { getDb } from "../../../../db";
import { accounts } from "../../../../db/schema";
import { issueAuthToken, recentlyIssued } from "../../../../lib/auth-email";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

export async function POST(request: Request) {
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: { email?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const email = normalizedEmail(body?.email);
  if (!email) return Response.json({ error: "Enter a valid email address." }, { status: 400, headers: privateResponse });
  try {
    const [account] = await getDb().select({ userId: accounts.userId }).from(accounts)
      .where(and(eq(accounts.email, email), isNotNull(accounts.passwordHash), isNotNull(accounts.emailVerifiedAt)));
    if (account && !(await recentlyIssued(account.userId, "reset"))) await issueAuthToken(request, account.userId, email, "reset");
    return Response.json({ message: "If that email has a verified account, a reset link will arrive shortly." }, { headers: privateResponse });
  } catch {
    return Response.json({ error: "Could not send a link. Please try again later." }, { status: 503, headers: privateResponse });
  }
}
