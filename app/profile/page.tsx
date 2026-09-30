import { eq, sql } from "drizzle-orm";
import CurrentlyPlaying from "../currently-playing";
import FavoriteGames from "../favorite-games";
import { getDb } from "../../db";
import { libraryItems } from "../../db/schema";
import { getCurrentlyPlaying } from "../../lib/currently-playing";
import { getGameFavorites } from "../../lib/game-favorites";
import { hasPermission } from "../../lib/permissions";
import { requireUser } from "../auth";
import { HallOfHonor, ProfileChallenges } from "../challenges";
import { ProfileNameplate } from "../profile-nameplate";
import SiteHeader from "../site-header";
import { isComplete, receivedChallenges, sentChallenges } from "../../lib/challenges";
import { accountDisplayName, ensureAccount } from "../../lib/social";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const account = await ensureAccount(user);
  const [received, sent, favorites, playing, [library]] = await Promise.all([
    receivedChallenges(user.userId),
    sentChallenges(user.userId, hasPermission(user, false)),
    getGameFavorites(user.userId),
    getCurrentlyPlaying(user.userId),
    getDb().select({
      games: sql<number>`count(distinct ${libraryItems.igdbId})`,
      completed: sql<number>`count(distinct case when ${libraryItems.completedAt} is not null then ${libraryItems.igdbId} end)`,
    }).from(libraryItems).where(eq(libraryItems.userId, user.userId)),
  ]);
  return <main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap profile-wrap">
    <ProfileNameplate seed={user.userId} name={accountDisplayName(account)} status={account.isPublic ? "public" : "private"} statusHref="/settings" topGame={favorites[0]} stats={[
      { label: "Games", value: library?.games ?? 0, href: "/library" },
      { label: "Completed", value: library?.completed ?? 0 },
      { label: "Challenges cleared", value: received.filter(isComplete).length },
    ]}/>
    <CurrentlyPlaying initialGames={playing} canManage isOwner/>
    <HallOfHonor received={received} viewerId={user.userId} canManage={hasPermission(user, false)} ownerControls/>
    <FavoriteGames initialFavorites={favorites} canManage isOwner/>
    <ProfileChallenges received={received} sent={sent} viewerId={user.userId} canManage={hasPermission(user, false)} ownerControls/>
  </div></main>;
}
