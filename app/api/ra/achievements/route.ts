import { eq } from "drizzle-orm";
import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { accounts } from "../../../../db/schema";
import { canViewProfile } from "../../../../lib/permissions";
import { getFriendship, privateResponse } from "../../../../lib/social";
import { getRaAchievementList } from "../../../../lib/ra";

// One added game's achievement list, visible to whoever can view the owner's profile.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("player") ?? "";
  const gameRowId = Number(url.searchParams.get("game"));
  if (!userId || userId.length > 100 || !Number.isSafeInteger(gameRowId) || gameRowId < 1) return Response.json({ error: "Choose a valid game." }, { status: 400 });
  try {
    const user = await getCurrentUser();
    const [target] = await getDb().select().from(accounts).where(eq(accounts.userId, userId));
    if (!target?.passwordHash || !target.emailVerifiedAt) return Response.json({ error: "This player was not found." }, { status: 404 });
    const friendship = user && user.userId !== userId ? await getFriendship(user.userId, userId) : undefined;
    if (!canViewProfile(user, target, friendship?.status)) return Response.json({ error: "This profile is private." }, { status: 403 });
    return Response.json({ achievements: await getRaAchievementList(userId, gameRowId) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not load achievements. Please try again." }, { status: 503 }); }
}
