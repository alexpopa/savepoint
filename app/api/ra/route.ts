import { getCurrentUser } from "../../auth";
import { hasPermission } from "../../../lib/permissions";
import { isSameOriginWrite } from "../../../lib/request-security";
import { privateResponse } from "../../../lib/social";
import { addAllRaGames, addRaGame, disconnectRa, getRaState, matchRaGames, refreshRa, applyRaPlaytime, removeRaLibrary, setRaSyncPaused, syncRaAchievements } from "../../../lib/ra";
import { RaError } from "../../../lib/ra-api";
import { raViews, type RaView } from "../../../lib/ra-queries";
import { raPlatformIds, validRaGameId } from "../../../lib/ra-types";

function response(body: unknown, status = 200) { return Response.json(body, { status, headers: privateResponse }); }
function failure(error: unknown) { return response({ error: error instanceof RaError ? error.message : "Could not update RetroAchievements. Please try again." }, error instanceof RaError ? error.status : 503); }
const validView = (view: unknown): view is RaView => typeof view === "string" && (raViews as string[]).includes(view);
const validPage = (page: unknown, search: unknown) => typeof page === "number" && Number.isSafeInteger(page) && page >= 0 && page <= 10000 && typeof search === "string" && search.length <= 100;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return response({ error: "Sign in to view your RetroAchievements connection." }, 401);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "all";
  const page = Number(url.searchParams.get("page") ?? 0), search = url.searchParams.get("search") ?? "";
  if (!validView(view)) return response({ error: "Choose a valid RetroAchievements view." }, 400);
  if (!validPage(page, search)) return response({ error: "Choose a valid page or search." }, 400);
  try { return response(await getRaState(user.userId, page, search, view)); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return response({ error: "Sign in to manage your RetroAchievements connection." }, 401);
  if (!request.headers.get("origin") || !isSameOriginWrite(request)) return response({ error: "Invalid request origin." }, 403);
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 2000) return response({ error: "Choose a valid RetroAchievements action." }, 400);
    payload = JSON.parse(body);
  } catch { return response({ error: "Invalid JSON." }, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response({ error: "Choose a valid RetroAchievements action." }, 400);
  const input = payload as Record<string, unknown>;
  const view = input.view ?? "all", page = input.page ?? 0, search = input.search ?? "";
  if (!validView(view) || !validPage(page, search)) return response({ error: "Choose a valid page or search." }, 400);
  try {
    if (input.action === "refresh") await refreshRa(user.userId);
    else if (input.action === "match") await matchRaGames(user.userId);
    else if (input.action === "achievements") await syncRaAchievements(user.userId);
    else if (input.action === "add" && validRaGameId(input.gameId) && (input.igdbId === undefined || typeof input.igdbId === "number" && Number.isSafeInteger(input.igdbId) && input.igdbId > 0)
      && (input.playing === undefined || typeof input.playing === "boolean") && (input.platformId === undefined || raPlatformIds.includes(input.platformId as number)))
      await addRaGame(user.userId, input.gameId, input.igdbId as number | undefined, input.playing === true, input.platformId as number | undefined);
    else if (input.action === "add-all" && typeof input.syncedAt === "number" && Number.isSafeInteger(input.syncedAt) && input.syncedAt > 0) await addAllRaGames(user.userId, input.syncedAt);
    else if (input.action === "pause" && typeof input.paused === "boolean") await setRaSyncPaused(user.userId, input.paused);
    else if (input.action === "remove-library") await removeRaLibrary(user.userId);
    else if (input.action === "use-playtime") await applyRaPlaytime(user.userId);
    else if (input.action === "disconnect") await disconnectRa(user.userId);
    else return response({ error: "Choose a valid RetroAchievements action." }, 400);
    return response(await getRaState(user.userId, page as number, search as string, view));
  } catch (error) { return failure(error); }
}
