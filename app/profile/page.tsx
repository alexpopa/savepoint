import CurrentlyPlaying from "../currently-playing";
import FavoriteGames from "../favorite-games";
import PsnTrophies from "../psn-trophies";
import RaAchievements from "../ra-achievements";
import XboxAchievements from "../xbox-achievements";
import { getPsnShowcase } from "../../lib/psn";
import { getRaShowcase } from "../../lib/ra";
import { getXboxShowcase } from "../../lib/xbox";
import { hasPermission } from "../../lib/permissions";
import { getOwnProfile } from "../../lib/profile";
import { requireUser } from "../auth";
import { HallOfHonor, ProfileChallenges } from "../challenges";
import { ProfileNameplate } from "../profile-nameplate";
import SiteHeader from "../site-header";
import { isComplete } from "../../lib/challenges";
import { accountDisplayName } from "../../lib/social";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const [{ isPublic, received, sent, favorites, playing, games, completed }, xbox, psn, ra] = await Promise.all([getOwnProfile(user), getXboxShowcase(user.userId), getPsnShowcase(user.userId),
    getRaShowcase(user.userId)]);
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={hasPermission(user, false)}/><div className="library-wrap profile-wrap">
    <ProfileNameplate seed={user.userId} name={accountDisplayName(user)} status={isPublic ? "public" : "private"} statusHref="/settings" topGame={favorites[0]} stats={[
      { label: "Games", value: games, href: "/library" },
      { label: "Completed", value: completed },
      { label: "Challenges cleared", value: received.filter(isComplete).length },
    ]}/>
    <CurrentlyPlaying initialGames={playing} canManage isOwner/>
    <HallOfHonor received={received} viewerId={user.userId} canManage={hasPermission(user, false)} ownerControls/>
    <FavoriteGames initialFavorites={favorites} canManage isOwner/>
    <XboxAchievements playerId={user.userId} games={xbox.games} totals={xbox.totals}/>
    <PsnTrophies playerId={user.userId} games={psn.games} totals={psn.totals}/>
    <RaAchievements playerId={user.userId} games={ra.games} totals={ra.totals}/>
    <ProfileChallenges received={received} sent={sent} viewerId={user.userId} canManage={hasPermission(user, false)} ownerControls/>
  </div></main>;
}
