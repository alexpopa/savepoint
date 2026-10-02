import { and, eq, sql } from "drizzle-orm";
import { getCurrentUser, sha256 } from "../../../auth";
import { getDb } from "../../../../db";
import { steamConnections, steamLinkStates } from "../../../../db/schema";
import { publicOrigin } from "../../../../lib/email";
import { hasPermission } from "../../../../lib/permissions";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";
import { steamConfigured } from "../../../../lib/steam";
import { steamLinkLifetime, steamLoginUrl } from "../../../../lib/steam-openid";

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: privateResponse });
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return reply({ error: "Sign in to connect Steam." }, 401);
  if (!request.headers.get("origin") || !isSameOriginWrite(request)) return reply({ error: "Invalid request origin." }, 403);
  if (!steamConfigured()) return reply({ error: "Steam is not configured yet. Ask the site owner to configure its API key." }, 503);
  try {
    const db = getDb();
    const [connection] = await db.select().from(steamConnections).where(eq(steamConnections.userId, user.userId));
    if (connection) return reply({ error: "Disconnect your existing Steam account before linking another." }, 409);
    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const returnTo = new URL("/api/steam/callback", publicOrigin(request));
    returnTo.searchParams.set("state", state);
    const now = Date.now();
    const values = { userId: user.userId, stateHash: await sha256(state), returnTo: returnTo.toString(), expiresAt: now + steamLinkLifetime };
    const saved = await db.insert(steamLinkStates).values(values).onConflictDoUpdate({ target: steamLinkStates.userId, set: values,
      setWhere: and(eq(steamLinkStates.userId, user.userId), sql`${steamLinkStates.expiresAt} < ${now + steamLinkLifetime - 60000}`) }).returning({ id: steamLinkStates.userId });
    if (!saved.length) return reply({ error: "Please wait a minute before starting another Steam connection." }, 429);
    return reply({ url: steamLoginUrl(returnTo.toString()) });
  } catch { return reply({ error: "Could not start Steam linking. Please try again." }, 503); }
}
