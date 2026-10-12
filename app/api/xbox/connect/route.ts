import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import { getCurrentUser, sha256 } from "../../../auth";
import { getDb } from "../../../../db";
import { xboxConnections, xboxLinkStates } from "../../../../db/schema";
import { publicOrigin } from "../../../../lib/email";
import { hasPermission } from "../../../../lib/permissions";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";
import { xboxConfigured } from "../../../../lib/xbox";
import { pkceChallenge, randomToken, xboxLinkLifetime, xboxLoginUrl } from "../../../../lib/xbox-api";

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: privateResponse });
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return reply({ error: "Sign in to connect Xbox." }, 401);
  if (!request.headers.get("origin") || !isSameOriginWrite(request)) return reply({ error: "Invalid request origin." }, 403);
  if (!xboxConfigured()) return reply({ error: "Xbox is not configured yet. Ask the site owner to configure Microsoft sign-in." }, 503);
  try {
    const db = getDb();
    const [connection] = await db.select().from(xboxConnections).where(eq(xboxConnections.userId, user.userId));
    if (connection) return reply({ error: "Disconnect your existing Xbox account before linking another." }, 409);
    const state = randomToken(), verifier = randomToken();
    const now = Date.now();
    const values = { userId: user.userId, stateHash: await sha256(state), verifier, expiresAt: now + xboxLinkLifetime };
    const saved = await db.insert(xboxLinkStates).values(values).onConflictDoUpdate({ target: xboxLinkStates.userId, set: values,
      setWhere: and(eq(xboxLinkStates.userId, user.userId), sql`${xboxLinkStates.expiresAt} < ${now + xboxLinkLifetime - 60000}`) }).returning({ id: xboxLinkStates.userId });
    if (!saved.length) return reply({ error: "Please wait a minute before starting another Xbox connection." }, 429);
    return reply({ url: xboxLoginUrl(env.XBOX_CLIENT_ID!, new URL("/api/xbox/callback", publicOrigin(request)).toString(), state, await pkceChallenge(verifier)) });
  } catch { return reply({ error: "Could not start Xbox linking. Please try again." }, 503); }
}
