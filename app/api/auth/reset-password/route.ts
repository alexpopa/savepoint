import { eq } from "drizzle-orm";
import { clearSessionCookie, hashPassword, validPassword } from "../../../auth";
import { getDb } from "../../../../db";
import { accounts, sessions } from "../../../../db/schema";
import { consumeAuthToken } from "../../../../lib/auth-email";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

export async function POST(request: Request) {
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: { token?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!validPassword(body?.password)) return Response.json({ error: "Use a password of 12 to 128 characters." }, { status: 400, headers: privateResponse });
  try {
    const token = await consumeAuthToken(body.token, "reset");
    if (!token) return Response.json({ error: "This link has expired or already been used. Request a new one." }, { status: 400, headers: privateResponse });
    const db = getDb();
    await db.update(accounts).set({ passwordHash: await hashPassword(body.password) }).where(eq(accounts.userId, token.userId));
    await db.delete(sessions).where(eq(sessions.userId, token.userId));
    return Response.json({ message: "Password changed. Sign in with your new password." }, { headers: { ...privateResponse, "set-cookie": clearSessionCookie(request) } });
  } catch {
    return Response.json({ error: "Password reset is temporarily unavailable." }, { status: 503, headers: privateResponse });
  }
}
