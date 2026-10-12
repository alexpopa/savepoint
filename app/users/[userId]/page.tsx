import CurrentlyPlaying from "../../currently-playing";
import FavoriteGames from "../../favorite-games";
import PsnTrophies from "../../psn-trophies";
import RaAchievements from "../../ra-achievements";
import XboxAchievements from "../../xbox-achievements";
import { getCurrentlyPlaying } from "../../../lib/currently-playing";
import { getGameFavorites } from "../../../lib/game-favorites";
import { getPsnShowcase } from "../../../lib/psn";
import { getRaShowcase } from "../../../lib/ra";
import { getXboxShowcase } from "../../../lib/xbox";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Gamepad2, Lock, MessageSquare, UserPlus } from "lucide-react";
import SiteHeader from "../../site-header";
import FriendButton from "../../friend-button";
import { HallOfHonor, ProfileChallenges } from "../../challenges";
import { ProfileNameplate } from "../../profile-nameplate";
import PublicLibrary from "./public-library";
import { getCurrentUser } from "../../auth";
import { getDb } from "../../../db";
import { accounts } from "../../../db/schema";
import { isComplete, receivedChallenges } from "../../../lib/challenges";
import { getIgdbGameCoversForGames } from "../../../lib/igdb";
import { messagesPath, profilePath } from "../../../lib/profile-path";
import { accountDisplayName, ensureAccount, getFriendship, getLibraryGames } from "../../../lib/social";
import { canViewProfile, hasPermission } from "../../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function UserLibraryPage({ params }: { params: Promise<{ userId: string }> }) {
  const routeSegment = (await params).userId;
  let profileName: string;
  try { profileName = decodeURIComponent(routeSegment); } catch { notFound(); }
  const user = await getCurrentUser();
  if (user) await ensureAccount(user);
  const db = getDb();
  const [namedAccount] = await db.select().from(accounts).where(and(sql`lower(${accounts.displayName}) = lower(${profileName})`, isNotNull(accounts.passwordHash), isNotNull(accounts.emailVerifiedAt)));
  const [target] = namedAccount ? [namedAccount] : await db.select().from(accounts).where(eq(accounts.userId, profileName));
  if (!target?.passwordHash || !target.emailVerifiedAt) notFound();
  const targetId = target.userId;
  if (targetId === user?.userId) redirect("/profile");
  if (!namedAccount && profilePath(target) !== `/users/${encodeURIComponent(profileName)}`) redirect(profilePath(target));
  const friendship = user ? await getFriendship(user.userId, targetId) : undefined;
  const canView = canViewProfile(user, target, friendship?.status);
  const canManageChallenges = hasPermission(user, false);
  const loginPath = `/login?return_to=${encodeURIComponent(profilePath(target))}`;
  const [games, challengeRows, favorites, playing, xbox, psn, ra] = canView ? await Promise.all([
    getLibraryGames(targetId),
    receivedChallenges(targetId),
    getGameFavorites(targetId),
    getCurrentlyPlaying(targetId),
    getXboxShowcase(targetId),
    getPsnShowcase(targetId),
    getRaShowcase(targetId),
  ]) : [[], [], [], [], null, null, null];
  let displayGames = games;
  const missingCoverGames = games.filter((game) => !game.coverUrl);
  if (missingCoverGames.length) {
    try {
      const covers = await getIgdbGameCoversForGames(missingCoverGames.map(({ igdbId, name, releaseYear }) => ({ igdbId, name, releaseYear })));
      displayGames = games.map((game) => {
        const recovered = covers.get(game.igdbId);
        return { ...game, coverUrl: game.coverUrl || recovered?.coverUrl || null, catalogIgdbId: recovered?.catalogIgdbId };
      });
    } catch {
      // Keep profile rendering available when IGDB cannot restore older cover art.
    }
  }
  const relationship = friendship ? { status: friendship.status, direction: friendship.requesterId === user?.userId ? "outgoing" as const : "incoming" as const } : null;
  const name = accountDisplayName(target);
  const status = friendship?.status === "accepted" ? "friend" : target.isPublic ? "public" : "private";
  return <main className="library-page"><SiteHeader email={user?.email} showAdmin={canManageChallenges}/><div className="library-wrap profile-wrap">
    <ProfileNameplate seed={targetId} name={name} status={status} topGame={canView ? favorites[0] : undefined} stats={canView ? [
      { label: "Games", value: new Set(games.map((game) => game.igdbId)).size, href: "#library" },
      { label: "Completed", value: new Set(games.filter((game) => game.completedAt).map((game) => game.igdbId)).size },
      { label: "Challenges cleared", value: challengeRows.filter(isComplete).length },
    ] : undefined}>
      {user ? friendship?.status === "accepted" ? <a className="friend-button" href={messagesPath(target)}><MessageSquare size={16} aria-hidden="true"/> Message</a> : <FriendButton userId={targetId} initialRelationship={relationship} refreshOnAccept/>
        : <a className="friend-button" href={loginPath}><UserPlus size={16} aria-hidden="true"/> Sign in to Add Friend</a>}
    </ProfileNameplate>
    {canView ? <>
      <CurrentlyPlaying initialGames={playing} canManage={hasPermission(user, targetId === user?.userId)} signedIn={Boolean(user)} loginPath={loginPath}/>
      <HallOfHonor received={challengeRows} viewerId={user?.userId ?? ""} canManage={canManageChallenges}/>
      <FavoriteGames initialFavorites={favorites} canManage={hasPermission(user, targetId === user?.userId)} signedIn={Boolean(user)} loginPath={loginPath}/>
      {xbox && <XboxAchievements playerId={targetId} games={xbox.games} totals={xbox.totals}/>}
      {psn && <PsnTrophies playerId={targetId} games={psn.games} totals={psn.totals}/>}
      {ra && <RaAchievements playerId={targetId} games={ra.games} totals={ra.totals}/>}
      <ProfileChallenges received={challengeRows} viewerId={user?.userId ?? ""} canManage={canManageChallenges}/>
      <section className="profile-section" id="library" aria-labelledby="library-title">
        <div className="profile-section-head"><h2 id="library-title" className="profile-label"><Gamepad2 size={15} aria-hidden="true"/>Library</h2></div>
        {games.length ? <PublicLibrary games={displayGames} recipientId={targetId} viewerId={user?.userId ?? ""} challengeRows={challengeRows} canManageChallenges={canManageChallenges} canCreateChallenges={hasPermission(user, friendship?.status === "accepted")} signedIn={Boolean(user)} loginPath={loginPath}/> : <p className="challenge-section-empty">No games saved yet.</p>}
      </section>
    </> : <div className="profile-locked"><Lock size={26} aria-hidden="true"/><h2>Friends only</h2></div>}
  </div></main>;
}
