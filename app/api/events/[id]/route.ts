import { getCurrentUser } from "../../../auth";
import { parseEventSettings, parsePoints } from "../../../../lib/event-rules";
import { copyEventFor, EventError, getEventDetail, runEventAction } from "../../../../lib/events";
import { maxPlayMinutes } from "../../../../lib/playtime";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { ensureAccount, privateResponse } from "../../../../lib/social";

type Context = { params: Promise<{ id: string }> };
function response(body: unknown, status = 200) { return Response.json(body, { status, headers: privateResponse }); }
function failure(error: unknown) {
  if (error instanceof EventError) return response({ error: error.message }, error.status);
  console.error("POST /api/events/:id failed", error instanceof Error ? error.message : "unknown error");
  return response({ error: "Could not update the event. Please try again." }, 503);
}
async function eventId(context: Context) {
  const id = Number((await context.params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
const positive = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const playerName = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 100;
const playerId = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 100;

// Shapes each action's payload before it reaches lib/events, so it can trust the types.
function validate(input: Record<string, unknown>): Record<string, unknown> | string {
  switch (input.action) {
    case "join": case "decline": case "leave": case "baseline": case "update": case "copy":
      return { action: input.action };
    case "add-game":
      return positive(input.libraryItemId) ? { action: input.action, libraryItemId: input.libraryItemId } : "Choose a game from your library.";
    case "edit-game":
      if (!positive(input.gameId)) return "Choose a game in this event.";
      if (typeof input.minutes !== "number" || !Number.isSafeInteger(input.minutes) || input.minutes < 0 || input.minutes > maxPlayMinutes) return "Enter hours played between 0 and 100,000.";
      if (typeof input.beaten !== "boolean" || typeof input.completed !== "boolean") return "Choose beaten and completed.";
      return { action: input.action, gameId: input.gameId, minutes: input.minutes, beaten: input.beaten, completed: input.completed };
    case "reset-game": case "remove-game":
      return positive(input.gameId) ? { action: input.action, gameId: input.gameId } : "Choose a game in this event.";
    case "settings": {
      const parsed = input.settings && typeof input.settings === "object" ? parseEventSettings(input.settings as Record<string, unknown>) : { error: "Fill in the event details." };
      return "error" in parsed ? parsed.error : { action: input.action, settings: parsed.settings };
    }
    case "set-multiplier": {
      const raw = input.multiplier as Record<string, unknown> | null;
      if (!raw || typeof raw !== "object" || raw.kind !== "game" || !positive(raw.targetId)) return "Choose a game.";
      const hourPoints = parsePoints(raw.hourPoints), beatenPoints = parsePoints(raw.beatenPoints), completedPoints = parsePoints(raw.completedPoints);
      if (hourPoints === null || beatenPoints === null || completedPoints === null) return "Multipliers are numbers from 0 to 100, in steps of 0.1.";
      return { action: input.action, multiplier: { kind: raw.kind, targetId: raw.targetId, hourPoints, beatenPoints, completedPoints } };
    }
    case "remove-multiplier":
      return positive(input.multiplierId) ? { action: input.action, multiplierId: input.multiplierId } : "Choose a multiplier.";
    case "add-host": case "invite":
      return playerName(input.displayName) ? { action: input.action, displayName: input.displayName } : "Enter a friend’s display name.";
    case "remove-host": case "uninvite":
      return playerId(input.userId) ? { action: input.action, userId: input.userId } : "Choose a player.";
    default:
      return "Choose a valid event action.";
  }
}

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return response({ error: "Sign in to see events." }, 401);
  const id = await eventId(context);
  if (!id) return response({ error: "Choose a valid event." }, 400);
  try { return response({ event: await getEventDetail(user, id) }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return response({ error: "Sign in to take part in events." }, 401);
  if (!isSameOriginWrite(request)) return response({ error: "Invalid request origin." }, 403);
  const id = await eventId(context);
  if (!id) return response({ error: "Choose a valid event." }, 400);
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 20000) return response({ error: "That request is too large." }, 400);
    payload = JSON.parse(body);
  } catch { return response({ error: "Invalid JSON." }, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response({ error: "Choose a valid event action." }, 400);
  const input = validate(payload as Record<string, unknown>);
  if (typeof input === "string") return response({ error: input }, 400);
  try {
    await ensureAccount(user);
    if (input.action === "copy") return response({ id: await copyEventFor(user, id) }, 201);
    const message = await runEventAction(user, id, input as { action: string });
    // Declining a private invitation can leave nothing to show.
    const event = await getEventDetail(user, id).catch((error) => { if (error instanceof EventError && error.status === 404) return null; throw error; });
    return response({ message, event });
  } catch (error) { return failure(error); }
}
