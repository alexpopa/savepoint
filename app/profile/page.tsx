import { eq, sql } from "drizzle-orm";
import FavoriteGames from "../favorite-games";
import { getDb } from "../../db";
import { libraryItems } from "../../db/schema";
import { getGameFavorites } from "../../lib/game-favorites";
import { hasPermission } from "../../lib/permissions";
import { requireUser } from "../auth";
import { ProfileChallenges } from "../challenges";
import { ProfileNameplate } from "../profile-nameplate";
import SiteHeader from "../site-header";
import { isComplete, receivedChallenges, sentChallenges } from "../../lib/challenges";
import { accountDisplayName, ensureAccount } from "../../lib/social";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const account = await ensureAccount(user);
  const [received, sent, favorites, [library]] = await Promise.all([
    receivedChallenges(user.userId),
    sentChallenges(user.userId, hasPermission(user, false)),
    getGameFavorites(user.userId),
    getDb().select({ games: sql<number>`count(distinct ${libraryItems.igdbId})` }).from(libraryItems).where(eq(libraryItems.userId, user.userId)),
  ]);
  const cleared = received.filter(isComplete).length;
  return <main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap profile-wrap">
    <ProfileNameplate seed={user.userId} name={accountDisplayName(account)} status={account.isPublic ? "public" : "private"} statusHref="/settings" stats={[
      { label: "Games", value: library?.games ?? 0, href: "/library" },
      { label: "Cleared", value: cleared },
      { label: "Pending", value: received.length - cleared },
    ]}/>
    <FavoriteGames initialFavorites={favorites} canManage isOwner/>
    <ProfileChallenges received={received} sent={sent} viewerId={user.userId} canManage={hasPermission(user, false)} ownerControls/>
  </div></main>;
}
