import { and, eq, isNotNull, sql } from "drizzle-orm";
import { createSession, loginAttemptKey, normalizedEmail, safeReturnPath, verifyPassword } from "../../../auth";
import { getDb } from "../../../../db";
import { accounts, loginAttempts } from "../../../../db/schema";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

export async function POST(request: Request) {
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: { email?: unknown; password?: unknown; returnTo?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
  const email = normalizedEmail(body.email);
  if (!email || typeof body.password !== "string" || body.password.length > 128) {
    return Response.json({ error: "Incorrect email or password." }, { status: 401, headers: privateResponse });
  }
  try {
    const db = getDb();
    const now = Date.now();
    const windowStart = now - 15 * 60 * 1000;
    const emailHash = await loginAttemptKey(email);
    const [attempt] = await db.select().from(loginAttempts).where(eq(loginAttempts.emailHash, emailHash));
    if (attempt && attempt.windowStart > windowStart && attempt.attempts >= 10) {
      return Response.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429, headers: privateResponse });
    }
    const [account] = await db.select({ userId: accounts.userId, passwordHash: accounts.passwordHash, emailVerifiedAt: accounts.emailVerifiedAt })
      .from(accounts).where(and(eq(accounts.email, email), isNotNull(accounts.passwordHash)));
    if (!account?.passwordHash || !(await verifyPassword(body.password, account.passwordHash))) {
      await db.insert(loginAttempts).values({ emailHash, attempts: 1, windowStart: now }).onConflictDoUpdate({
        target: loginAttempts.emailHash,
        set: {
          attempts: sql`CASE WHEN ${loginAttempts.windowStart} > ${windowStart} THEN ${loginAttempts.attempts} + 1 ELSE 1 END`,
          windowStart: sql`CASE WHEN ${loginAttempts.windowStart} > ${windowStart} THEN ${loginAttempts.windowStart} ELSE ${now} END`,
        },
      });
      return Response.json({ error: "Incorrect email or password." }, { status: 401, headers: privateResponse });
    }
    await db.delete(loginAttempts).where(eq(loginAttempts.emailHash, emailHash));
    if (!account.emailVerifiedAt) return Response.json({ error: "Verify your email before signing in. You can request a new link below.", needsVerification: true }, { status: 403, headers: privateResponse });
    const cookie = await createSession(account.userId, request);
    return Response.json({ returnTo: safeReturnPath(body.returnTo) }, { headers: { ...privateResponse, "set-cookie": cookie } });
  } catch {
    return Response.json({ error: "Login is temporarily unavailable." }, { status: 503, headers: privateResponse });
  }
}
