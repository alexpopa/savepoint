import { eq } from "drizzle-orm";
import { createSession } from "../../../auth";
import { getDb } from "../../../../db";
import { accounts } from "../../../../db/schema";
import { consumeAuthToken } from "../../../../lib/auth-email";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

export async function POST(request: Request) {
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: { token?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  try {
    const token = await consumeAuthToken(body?.token, "verify");
    if (!token) return Response.json({ error: "This link has expired or already been used. Request a new one." }, { status: 400, headers: privateResponse });
    await getDb().update(accounts).set({ emailVerifiedAt: Date.now() }).where(eq(accounts.userId, token.userId));
    const cookie = await createSession(token.userId, request);
    return Response.json({ returnTo: "/" }, { headers: { ...privateResponse, "set-cookie": cookie } });
  } catch {
    return Response.json({ error: "Email verification is temporarily unavailable." }, { status: 503, headers: privateResponse });
  }
}
