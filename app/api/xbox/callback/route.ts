import { env } from "cloudflare:workers";
import { and, eq, gt } from "drizzle-orm";
import { getCurrentUser, sha256 } from "../../../auth";
import { getDb } from "../../../../db";
import { xboxLinkStates } from "../../../../db/schema";
import { publicOrigin } from "../../../../lib/email";
import { xboxConfigured, type XboxTokens } from "../../../../lib/xbox";
import { authorizeXbox, exchangeXboxCode, XboxError } from "../../../../lib/xbox-api";
import { sealToken } from "../../../../lib/xbox-crypto";
import { consumeXboxState, linkXboxConnection } from "../../../../lib/xbox-queries";

// Microsoft's browser redirect is the intentional exception to JSON API responses.
export async function GET(request: Request) {
  let stage = "session";
  const finish = (status: string, reason?: string) => {
    // Fixed diagnostic labels only: never log codes, tokens, state, or identity.
    if (reason) console.error("Xbox callback rejected", reason);
    return new Response(null, { status: 303, headers: { location: `/settings/xbox?link=${status}`, "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
  };
  try {
    const user = await getCurrentUser();
    if (!user) return finish("expired");
    const url = new URL(request.url);
    for (const key of url.searchParams.keys()) if (url.searchParams.getAll(key).length !== 1) return finish("failed", "duplicate_parameters");
    const state = url.searchParams.get("state");
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || url.toString().length > 10000) return finish("failed");
    const hash = await sha256(state);
    stage = "pending_state_read";
    const db = getDb();
    const [pending] = await db.select().from(xboxLinkStates).where(and(eq(xboxLinkStates.userId, user.userId), eq(xboxLinkStates.stateHash, hash), gt(xboxLinkStates.expiresAt, Date.now())));
    if (!pending) return finish("expired");
    if (url.searchParams.get("error")) {
      await db.$client.prepare(consumeXboxState).bind(user.userId, hash).run();
      return finish(url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed", "provider_error");
    }
    const code = url.searchParams.get("code");
    if (!code || code.length > 4000 || !xboxConfigured()) return finish("failed", "authorization_code");
    stage = "token_exchange";
    const redirectUri = new URL("/api/xbox/callback", publicOrigin(request)).toString();
    const microsoft = await exchangeXboxCode(env.XBOX_CLIENT_ID!, env.XBOX_CLIENT_SECRET!, redirectUri, code, pending.verifier);
    stage = "xbox_authorization";
    const xsts = await authorizeXbox(microsoft.accessToken);
    stage = "connection_write";
    const connectionId = crypto.randomUUID();
    const cipher = await sealToken({ refreshToken: microsoft.refreshToken, xsts } satisfies XboxTokens, env.XBOX_TOKEN_KEY!, connectionId);
    // State consumption and insertion are one transaction: disconnect invalidates a callback still waiting on Microsoft.
    const results = await db.$client.batch([
      db.$client.prepare(linkXboxConnection).bind(user.userId, hash, Date.now(), connectionId, xsts.xuid, xsts.gamertag, cipher),
      db.$client.prepare(consumeXboxState).bind(user.userId, hash),
    ]);
    return finish(results[0].meta.changes === 1 ? "connected" : "unavailable");
  } catch (error) {
    if (error instanceof XboxError && error.status === 409) return finish("profile", `${stage}:profile`);
    const message = error instanceof Error ? error.message : "";
    const category = error instanceof XboxError ? "provider" : /timeout|aborted/i.test(message) ? "timeout" : "other";
    return finish("failed", `${stage}:${category}`);
  }
}
