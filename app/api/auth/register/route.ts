import { eq, isNotNull, and, sql } from "drizzle-orm";
import { hashPassword, normalizedEmail, validPassword } from "../../../auth";
import { getDb } from "../../../../db";
import { accounts } from "../../../../db/schema";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";
import { issueAuthToken } from "../../../../lib/auth-email";
import { assertEmailDeliveryReady } from "../../../../lib/email";

export async function POST(request: Request) {
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: { email?: unknown; password?: unknown; displayName?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
  const email = normalizedEmail(body.email);
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!email || !validPassword(body.password) || !displayName || displayName.length > 80 || displayName.toLowerCase() === email || /[\\/%\u0000-\u001f\u007f]/.test(displayName) || displayName === "." || displayName === ".." || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(displayName)) {
    return Response.json({ error: "Enter a display name of up to 80 characters that is not your email or an ID, has no slashes, percent signs, or control characters, and a valid email and password of 12 to 128 characters." }, { status: 400 });
  }
  try {
    assertEmailDeliveryReady(request);
    const db = getDb();
    const [existing] = await db.select({ userId: accounts.userId }).from(accounts).where(and(eq(accounts.email, email), isNotNull(accounts.passwordHash)));
    if (existing) return Response.json({ error: "An account with that email already exists." }, { status: 409 });
    const [takenName] = await db.select({ userId: accounts.userId }).from(accounts).where(and(sql`lower(${accounts.displayName}) = lower(${displayName})`, isNotNull(accounts.passwordHash)));
    if (takenName) return Response.json({ error: "That display name is already taken. Choose another one." }, { status: 409 });
    const userId = crypto.randomUUID();
    try {
      await db.insert(accounts).values({ userId, email, displayName, passwordHash: await hashPassword(body.password) });
    } catch (error) {
      // A competing registration can take the email or name after the checks above.
      const [emailConflict] = await db.select({ userId: accounts.userId }).from(accounts).where(and(eq(accounts.email, email), isNotNull(accounts.passwordHash)));
      if (emailConflict) return Response.json({ error: "An account with that email already exists." }, { status: 409 });
      const [nameConflict] = await db.select({ userId: accounts.userId }).from(accounts).where(and(sql`lower(${accounts.displayName}) = lower(${displayName})`, isNotNull(accounts.passwordHash)));
      if (nameConflict) return Response.json({ error: "That display name is already taken. Choose another one." }, { status: 409 });
      throw error;
    }
    await issueAuthToken(request, userId, email, "verify");
    return Response.json({ message: "Check your email for a verification link before signing in." }, { status: 201, headers: privateResponse });
  } catch (error) {
    console.error("POST /api/auth/register failed", error instanceof Error ? error.stack ?? error.message : error);
    return Response.json({ error: "Could not create the account. Please try again." }, { status: 503, headers: privateResponse });
  }
}
