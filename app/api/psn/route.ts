import { getCurrentUser } from "../../auth";
import { hasPermission } from "../../../lib/permissions";
import { isSameOriginWrite } from "../../../lib/request-security";
import { privateResponse } from "../../../lib/social";
import { addAllPsnGames, addPsnGame, disconnectPsn, getPsnState, matchPsnGames, refreshPsn, applyPsnPlaytime, removePsnLibrary, setPsnSyncPaused, syncPsnTrophies } from "../../../lib/psn";
import { PsnError } from "../../../lib/psn-api";
import { psnViews, type PsnView } from "../../../lib/psn-queries";
import { psnPlatformIds, validPsnTitleKey } from "../../../lib/psn-types";

function response(body: unknown, status = 200) { return Response.json(body, { status, headers: privateResponse }); }
function failure(error: unknown) { return response({ error: error instanceof PsnError ? error.message : "Could not update PlayStation. Please try again." }, error instanceof PsnError ? error.status : 503); }
const validView = (view: unknown): view is PsnView => typeof view === "string" && (psnViews as string[]).includes(view);
const validPage = (page: unknown, search: unknown) => typeof page === "number" && Number.isSafeInteger(page) && page >= 0 && page <= 10000 && typeof search === "string" && search.length <= 100;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return response({ error: "Sign in to view your PlayStation connection." }, 401);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "all";
  const page = Number(url.searchParams.get("page") ?? 0), search = url.searchParams.get("search") ?? "";
  if (!validView(view)) return response({ error: "Choose a valid PlayStation view." }, 400);
  if (!validPage(page, search)) return response({ error: "Choose a valid page or search." }, 400);
  try { return response(await getPsnState(user.userId, page, search, view)); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return response({ error: "Sign in to manage your PlayStation connection." }, 401);
  if (!request.headers.get("origin") || !isSameOriginWrite(request)) return response({ error: "Invalid request origin." }, 403);
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 2000) return response({ error: "Choose a valid PlayStation action." }, 400);
    payload = JSON.parse(body);
  } catch { return response({ error: "Invalid JSON." }, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response({ error: "Choose a valid PlayStation action." }, 400);
  const input = payload as Record<string, unknown>;
  const view = input.view ?? "all", page = input.page ?? 0, search = input.search ?? "";
  if (!validView(view) || !validPage(page, search)) return response({ error: "Choose a valid page or search." }, 400);
  try {
    if (input.action === "refresh") await refreshPsn(user.userId);
    else if (input.action === "match") await matchPsnGames(user.userId);
    else if (input.action === "trophies") await syncPsnTrophies(user.userId);
    else if (input.action === "add" && validPsnTitleKey(input.titleKey) && (input.igdbId === undefined || typeof input.igdbId === "number" && Number.isSafeInteger(input.igdbId) && input.igdbId > 0)
      && (input.playing === undefined || typeof input.playing === "boolean") && (input.platformId === undefined || psnPlatformIds.includes(input.platformId as number)))
      await addPsnGame(user.userId, input.titleKey, input.igdbId as number | undefined, input.playing === true, input.platformId as number | undefined);
    else if (input.action === "add-all" && typeof input.syncedAt === "number" && Number.isSafeInteger(input.syncedAt) && input.syncedAt > 0) await addAllPsnGames(user.userId, input.syncedAt);
    else if (input.action === "pause" && typeof input.paused === "boolean") await setPsnSyncPaused(user.userId, input.paused);
    else if (input.action === "remove-library") await removePsnLibrary(user.userId);
    else if (input.action === "use-playtime") await applyPsnPlaytime(user.userId);
    else if (input.action === "disconnect") await disconnectPsn(user.userId);
    else return response({ error: "Choose a valid PlayStation action." }, 400);
    return response(await getPsnState(user.userId, page as number, search as string, view));
  } catch (error) { return failure(error); }
}
