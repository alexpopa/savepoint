import { and, eq, gt } from "drizzle-orm";
import { getCurrentUser, sha256 } from "../../../auth";
import { getDb } from "../../../../db";
import { steamLinkStates } from "../../../../db/schema";
import { publicOrigin } from "../../../../lib/email";
import { consumeSteamState, linkSteamConnection } from "../../../../lib/steam-queries";
import { steamAssertionFailure, verifySteamAssertion } from "../../../../lib/steam-openid";

// OpenID's browser callback is the intentional redirect exception to JSON API responses.
export async function GET(request: Request) {
  let stage = "session";
  const finish = (status: string, reason?: string) => {
    // Fixed diagnostic labels only: never log assertions, state, signatures, or identity.
    if (reason) console.error("Steam callback rejected", reason);
    return new Response(null, { status: 303, headers: { location: `/settings/steam?link=${status}`, "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
  };
  try {
    const user = await getCurrentUser();
    if (!user) return finish("expired");
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    if (!state || !/^[0-9a-f]{64}$/.test(state) || url.toString().length > 10000) return finish("failed");
    const hash = await sha256(state);
    stage = "pending_state_read";
    const db = getDb();
    const [pending] = await db.select().from(steamLinkStates).where(and(eq(steamLinkStates.userId, user.userId), eq(steamLinkStates.stateHash, hash), gt(steamLinkStates.expiresAt, Date.now())));
    if (!pending) return finish("expired");
    stage = "callback_configuration";
    const expected = new URL("/api/steam/callback", publicOrigin(request));
    expected.searchParams.set("state", state);
    if (pending.returnTo !== expected.toString()) return finish("failed", "callback_origin");
    if (url.searchParams.get("openid.mode") === "cancel") return finish("cancelled");
    const invalid = steamAssertionFailure(url.searchParams, pending.returnTo);
    if (invalid) return finish("failed", invalid);
    stage = "steam_verification_request";
    const steamId = await verifySteamAssertion(url.searchParams, pending.returnTo);
    if (!steamId) return finish("failed", "signature_verification");
    // State consumption and insertion are one transaction: disconnect invalidates a
    // callback even if it was already waiting for Steam to verify the signature.
    stage = "connection_write";
    const results = await db.$client.batch([
      db.$client.prepare(linkSteamConnection).bind(user.userId, hash, Date.now(), crypto.randomUUID(), steamId),
      db.$client.prepare(consumeSteamState).bind(user.userId, hash),
    ]);
    return finish(results[0].meta.changes === 1 ? "connected" : "unavailable");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const category = /redirect/i.test(message) ? "redirect" : /certificate|TLS|SSL/i.test(message) ? "tls" : /timeout|aborted/i.test(message) ? "timeout" : "other";
    return finish("failed", `${stage}:${category}`);
  }
}
