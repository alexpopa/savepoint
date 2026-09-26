import FavoriteGames from "../favorite-games";
import { getGameFavorites } from "../../lib/game-favorites";
import { hasPermission } from "../../lib/permissions";
import { requireUser } from "../auth";
import { ChallengeSections } from "../challenges";
import SiteHeader from "../site-header";
import { receivedChallenges, sentChallenges } from "../../lib/challenges";
import { accountDisplayName, ensureAccount } from "../../lib/social";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const account = await ensureAccount(user);
  const [received, sent, favorites] = await Promise.all([receivedChallenges(user.userId), sentChallenges(user.userId, hasPermission(user, false)), getGameFavorites(user.userId)]);
  return <main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap"><div className="page-heading"><div><p className="eyebrow">YOUR PROFILE</p><h1>{accountDisplayName(account)}&apos;s profile</h1><p className="subcopy">Your favorite games and challenges. Your visibility setting controls who can view this profile.</p></div></div><FavoriteGames initialFavorites={favorites} canManage isOwner/><ChallengeSections rows={received} viewerId={user.userId} canManage={hasPermission(user, false)} ownerControls title="Challenges for you"/><ChallengeSections rows={sent} viewerId={user.userId} canManage={hasPermission(user, false)} title="Challenges you created"/></div></main>;
}
