import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { gameRatings } from "../../../../db/schema";
import { insertGameRating, rescoreGameRating } from "../../../../lib/game-rating-queries";
import { getIgdbGame } from "../../../../lib/igdb";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

type Context = { params: Promise<{ igdbId: string }> };
async function gameId(context: Context) {
  const igdbId = Number((await context.params).igdbId);
  return Number.isSafeInteger(igdbId) && igdbId > 0 ? igdbId : null;
}
async function currentScore(userId: string, igdbId: number) {
  const [row] = await getDb().select({ score: gameRatings.score }).from(gameRatings).where(and(eq(gameRatings.userId, userId), eq(gameRatings.igdbId, igdbId)));
  return row?.score ?? null;
}

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to see your score." }, { status: 401 });
  const igdbId = await gameId(context);
  if (!igdbId) return Response.json({ error: "Choose a valid game." }, { status: 400 });
  try {
    return Response.json({ score: await currentScore(user.userId, igdbId) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not load your score." }, { status: 503 }); }
}

// Scores always belong to the signed-in viewer, so there is no other owner to authorize.
export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to rate games." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const igdbId = await gameId(context);
  if (!igdbId) return Response.json({ error: "Choose a valid game." }, { status: 400 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const score = (payload as { score?: unknown } | null)?.score;
  if (typeof score !== "number" || !Number.isSafeInteger(score) || score < 1 || score > 5)
    return Response.json({ error: "Choose a score from 1 to 5 stars." }, { status: 400 });
  try {
    const db = getDb();
    const { meta } = await db.$client.prepare(rescoreGameRating).bind(user.userId, igdbId, score).run();
    if (!meta.changes) {
      const game = await getIgdbGame(igdbId);
      if (!game) return Response.json({ error: "That game is not available in IGDB." }, { status: 404 });
      await db.$client.prepare(insertGameRating).bind(user.userId, game.igdbId, game.name, game.coverUrl, game.releaseYear, score, Date.now()).run();
    }
    return Response.json({ score: await currentScore(user.userId, igdbId) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not save your score. Please try again." }, { status: 503 }); }
}

export async function DELETE(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to rate games." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const igdbId = await gameId(context);
  if (!igdbId) return Response.json({ error: "Choose a valid game." }, { status: 400 });
  try {
    await getDb().delete(gameRatings).where(and(eq(gameRatings.userId, user.userId), eq(gameRatings.igdbId, igdbId)));
    return Response.json({ score: null }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not clear your score. Please try again." }, { status: 503 }); }
}
