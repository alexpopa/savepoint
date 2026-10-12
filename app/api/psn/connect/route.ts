import { getCurrentUser } from "../../../auth";
import { hasPermission } from "../../../../lib/permissions";
import { connectPsn, getPsnState, psnConfigured } from "../../../../lib/psn";
import { PsnError, validNpsso } from "../../../../lib/psn-api";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

// Connects or reconnects with a pasted NPSSO. The NPSSO is exchanged at once and never stored or logged.
export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: privateResponse });
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return reply({ error: "Sign in to connect PlayStation." }, 401);
  if (!request.headers.get("origin") || !isSameOriginWrite(request)) return reply({ error: "Invalid request origin." }, 403);
  if (!psnConfigured()) return reply({ error: "PlayStation is not configured yet. Ask the site owner to add the PlayStation token key." }, 503);
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 1000) return reply({ error: "Paste the 64-character NPSSO token from Sony." }, 400);
    payload = JSON.parse(body);
  } catch { return reply({ error: "Invalid JSON." }, 400); }
  const npsso = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).npsso : undefined;
  const value = typeof npsso === "string" ? npsso.trim() : npsso;
  if (!validNpsso(value)) return reply({ error: "Paste the 64-character NPSSO token from Sony." }, 400);
  try {
    await connectPsn(user.userId, value);
    return reply(await getPsnState(user.userId));
  } catch (error) {
    if (!(error instanceof PsnError)) console.error("POST /api/psn/connect failed", error instanceof Error ? error.name : "unknown");
    return reply({ error: error instanceof PsnError ? error.message : "Could not connect PlayStation. Please try again." }, error instanceof PsnError ? error.status : 503);
  }
}
