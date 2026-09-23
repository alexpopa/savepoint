import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { accounts } from "../../../db/schema";
import { ensureAccount, getSocialState, privateResponse } from "../../../lib/social";
import { isSameOriginWrite } from "../../../lib/request-security";
import { eq } from "drizzle-orm";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to view account settings." }, { status: 401 });
  try {
    const account = await ensureAccount(user);
    const people = await getSocialState(user.userId);
    return Response.json({ account: { userId: account.userId, email: account.email, displayName: account.displayName, isPublic: account.isPublic }, people }, { headers: privateResponse });
  } catch {
    return Response.json({ error: "Account settings are temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to change account settings." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || typeof (payload as { isPublic?: unknown }).isPublic !== "boolean") {
    return Response.json({ error: "Choose public or private visibility." }, { status: 400 });
  }
  try {
    await ensureAccount(user);
    const isPublic = (payload as { isPublic: boolean }).isPublic;
    await getDb().update(accounts).set({ isPublic }).where(eq(accounts.userId, user.userId));
    return Response.json({ isPublic }, { headers: privateResponse });
  } catch {
    return Response.json({ error: "Could not update account visibility." }, { status: 503 });
  }
}
