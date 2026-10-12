import { getCurrentUser } from "../../../auth";
import { hasPermission } from "../../../../lib/permissions";
import { cancelRaLink, getRaState, raConfigured, startRaLink, verifyRaLink } from "../../../../lib/ra";
import { RaError } from "../../../../lib/ra-api";
import { validRaUsername } from "../../../../lib/ra-types";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

// Links an account in two steps: `start` with a username returns a code for the RA motto, `verify` reads the motto back.
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: privateResponse });
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return reply({ error: "Sign in to connect RetroAchievements." }, 401);
  if (!request.headers.get("origin") || !isSameOriginWrite(request)) return reply({ error: "Invalid request origin." }, 403);
  if (!raConfigured()) return reply({ error: "RetroAchievements is not configured yet. Ask the site owner to add the RetroAchievements API key." }, 503);
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 1000) return reply({ error: "Choose a valid RetroAchievements action." }, 400);
    payload = JSON.parse(body);
  } catch { return reply({ error: "Invalid JSON." }, 400); }
  const input = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const username = typeof input.username === "string" ? input.username.trim() : input.username;
  try {
    if (input.action === "start") {
      if (!validRaUsername(username)) return reply({ error: "Enter your RetroAchievements username." }, 400);
      await startRaLink(user.userId, username);
    } else if (input.action === "verify") await verifyRaLink(user.userId);
    else if (input.action === "cancel") await cancelRaLink(user.userId);
    else return reply({ error: "Choose a valid RetroAchievements action." }, 400);
    return reply(await getRaState(user.userId));
  } catch (error) {
    if (!(error instanceof RaError)) console.error("POST /api/ra/connect failed", error instanceof Error ? error.name : "unknown");
    return reply({ error: error instanceof RaError ? error.message : "Could not connect RetroAchievements. Please try again." }, error instanceof RaError ? error.status : 503);
  }
}
