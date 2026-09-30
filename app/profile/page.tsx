import CurrentlyPlaying from "../currently-playing";
import FavoriteGames from "../favorite-games";
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
  const { isPublic, received, sent, favorites, playing, games, completed } = await getOwnProfile(user);
  return <main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap profile-wrap">
    <ProfileNameplate seed={user.userId} name={accountDisplayName(user)} status={isPublic ? "public" : "private"} statusHref="/settings" topGame={favorites[0]} stats={[
      { label: "Games", value: games, href: "/library" },
      { label: "Completed", value: completed },
      { label: "Challenges cleared", value: received.filter(isComplete).length },
    ]}/>
    <CurrentlyPlaying initialGames={playing} canManage isOwner/>
    <HallOfHonor received={received} viewerId={user.userId} canManage={hasPermission(user, false)} ownerControls/>
    <FavoriteGames initialFavorites={favorites} canManage isOwner/>
    <ProfileChallenges received={received} sent={sent} viewerId={user.userId} canManage={hasPermission(user, false)} ownerControls/>
  </div></main>;
}
