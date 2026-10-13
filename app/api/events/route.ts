import { getCurrentUser } from "../../auth";
import { parseEventSettings } from "../../../lib/event-rules";
import { createEvent, EventError, getEventList } from "../../../lib/events";
import { isSameOriginWrite } from "../../../lib/request-security";
import { ensureAccount, privateResponse } from "../../../lib/social";

function response(body: unknown, status = 200) { return Response.json(body, { status, headers: privateResponse }); }

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return response({ error: "Sign in to see events." }, 401);
  try { return response({ events: await getEventList(user) }); }
  catch { return response({ error: "Events are temporarily unavailable." }, 503); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return response({ error: "Sign in to create events." }, 401);
  if (!isSameOriginWrite(request)) return response({ error: "Invalid request origin." }, 403);
  let payload: unknown;
  try { payload = await request.json(); } catch { return response({ error: "Invalid JSON." }, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response({ error: "Fill in the event details." }, 400);
  const parsed = parseEventSettings(payload as Record<string, unknown>);
  if ("error" in parsed) return response({ error: parsed.error }, 400);
  try {
    await ensureAccount(user);
    return response({ id: await createEvent(user, parsed.settings) }, 201);
  } catch (error) {
    if (error instanceof EventError) return response({ error: error.message }, error.status);
    return response({ error: "Could not create the event. Please try again." }, 503);
  }
}
