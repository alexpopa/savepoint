import { getCurrentUser } from "../../auth";
import { hasPermission } from "../../../lib/permissions";
import { isSameOriginWrite } from "../../../lib/request-security";
import { privateResponse } from "../../../lib/social";
import { chooseSteamMatch, disconnectSteam, getSteamState, ignoreSteamGame, importSteamGames, importMatchedSteamBatch, matchSteamGames, refreshSteam, resolveSteamGame } from "../../../lib/steam";
import { steamPlatformIds } from "../../../lib/steam-types";
import { SteamError, validAppId } from "../../../lib/steam-api";

function response(body: unknown, status = 200) { return Response.json(body, { status, headers: privateResponse }); }
function failure(error: unknown) { return response({ error: error instanceof SteamError ? error.message : "Could not update Steam. Please try again." }, error instanceof SteamError ? error.status : 503); }

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return response({ error: "Sign in to view your Steam connection." }, 401);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "all";
  if (!["all", "ready", "review", "imported"].includes(view)) return response({ error: "Choose a valid import view." }, 400);
  const page = Number(url.searchParams.get("page") ?? 0);
  const search = url.searchParams.get("search") ?? "";
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000 || search.length > 100) return response({ error: "Choose a valid preview page or search." }, 400);
  try { return response(await getSteamState(user.userId, page, search, view)); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!hasPermission(user, true) || !user) return response({ error: "Sign in to manage your Steam connection." }, 401);
  if (!request.headers.get("origin") || !isSameOriginWrite(request)) return response({ error: "Invalid request origin." }, 403);
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 10000) return response({ error: "Choose at most 30 games at a time." }, 400);
    payload = JSON.parse(body);
  } catch { return response({ error: "Invalid JSON." }, 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response({ error: "Choose a valid Steam action." }, 400);
  const input = payload as Record<string, unknown>;
  const view = input.view ?? "all", page = input.page ?? 0, search = input.search ?? "";
  if (typeof view !== "string" || !["all", "ready", "review", "imported"].includes(view) || typeof page !== "number" || !Number.isSafeInteger(page) || page < 0 || page > 10000 || typeof search !== "string" || search.length > 100)
    return response({ error: "Choose a valid preview page or search." }, 400);
  try {
    if (input.action === "refresh") await refreshSteam(user.userId);
    else if (input.action === "match") await matchSteamGames(user.userId);
    else if (input.action === "import-matched" && typeof input.steamId === "string" && /^\d{17}$/.test(input.steamId) && typeof input.syncedAt === "number" && Number.isSafeInteger(input.syncedAt) && input.syncedAt > 0)
      await importMatchedSteamBatch(user.userId, input.steamId, input.syncedAt);
    else if (input.action === "resolve" && validAppId(input.appId) && (input.igdbId === undefined || typeof input.igdbId === "number" && Number.isSafeInteger(input.igdbId) && input.igdbId > 0))
      await resolveSteamGame(user.userId, input.appId, input.igdbId as number | undefined);
    else if (input.action === "disconnect") await disconnectSteam(user.userId);
    else if (input.action === "choose" && validAppId(input.appId) && typeof input.igdbId === "number" && Number.isSafeInteger(input.igdbId) && input.igdbId > 0)
      await chooseSteamMatch(user.userId, input.appId, input.igdbId);
    else if (input.action === "ignore" && validAppId(input.appId) && typeof input.ignored === "boolean")
      await ignoreSteamGame(user.userId, input.appId, input.ignored);
    else if (input.action === "import" && Array.isArray(input.selections) && input.selections.length > 0 && input.selections.length <= 30) {
      const selections: { appId: number; platformId: number }[] = [];
      for (const entry of input.selections) {
        if (!entry || typeof entry !== "object" || !validAppId(entry.appId) || !steamPlatformIds.includes(entry.platformId) || selections.some((choice) => choice.appId === entry.appId))
          return response({ error: "Choose unique games and a supported desktop platform." }, 400);
        selections.push({ appId: entry.appId, platformId: entry.platformId });
      }
      await importSteamGames(user.userId, selections);
    } else return response({ error: "Choose a valid Steam action." }, 400);
    return response(await getSteamState(user.userId, page, search, view));
  } catch (error) { return failure(error); }
}
