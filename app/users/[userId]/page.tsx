import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import SiteHeader from "../../site-header";
import FriendButton from "../../friend-button";
import { ChallengeSections } from "../../challenges";
import PublicLibrary from "./public-library";
import { requireUser } from "../../auth";
import { getDb } from "../../../db";
import { accounts, libraryItems } from "../../../db/schema";
import { receivedChallenges } from "../../../lib/challenges";
import { getIgdbGameCoversForGames } from "../../../lib/igdb";
import { profilePath } from "../../../lib/profile-path";
import { accountDisplayName, ensureAccount, getFriendship, serializeGame } from "../../../lib/social";
import { canViewProfile, hasPermission } from "../../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function UserLibraryPage({ params }: { params: Promise<{ userId: string }> }) {
  const routeSegment = (await params).userId;
  let profileName: string;
  try { profileName = decodeURIComponent(routeSegment); } catch { notFound(); }
  const user = await requireUser(`/users/${encodeURIComponent(profileName)}`);
  await ensureAccount(user);
  const db = getDb();
  const [namedAccount] = await db.select().from(accounts).where(and(sql`lower(${accounts.displayName}) = lower(${profileName})`, isNotNull(accounts.passwordHash), isNotNull(accounts.emailVerifiedAt)));
  const [target] = namedAccount ? [namedAccount] : await db.select().from(accounts).where(eq(accounts.userId, profileName));
  if (!target?.passwordHash || !target.emailVerifiedAt) notFound();
  const targetId = target.userId;
  if (targetId === user.userId) redirect("/profile");
  if (!namedAccount && profilePath(target) !== `/users/${encodeURIComponent(profileName)}`) redirect(profilePath(target));
  const friendship = await getFriendship(user.userId, targetId);
  const canView = canViewProfile(user, target, friendship?.status);
  const canManageChallenges = hasPermission(user, false);
  const [games, challengeRows] = canView ? await Promise.all([
    getDb().select().from(libraryItems).where(eq(libraryItems.userId, targetId)).orderBy(desc(libraryItems.addedAt)).then((rows) => rows.map(serializeGame)),
    receivedChallenges(targetId),
  ]) : [[], []];
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
  const relationship = friendship ? { status: friendship.status, direction: friendship.requesterId === user.userId ? "outgoing" as const : "incoming" as const } : null;
  const name = accountDisplayName(target);
  return <main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap">
    <div className="page-heading"><div><p className="eyebrow">{target.isPublic ? "PUBLIC PROFILE" : friendship?.status === "accepted" ? "FRIEND PROFILE" : "PRIVATE PROFILE"}</p><h1>{name}&apos;s profile</h1><p className="subcopy">{canView ? "Games and challenges shared by this player." : "This profile is private. Become friends to see their games and challenges."}</p>{friendship?.status !== "accepted" && <div className="profile-friend-action"><FriendButton userId={targetId} initialRelationship={relationship} refreshOnAccept/></div>}</div>{canView && <div className="game-count"><strong>{games.length.toString().padStart(2, "0")}</strong><span>PLATFORM<br/>COPIES</span></div>}</div>
    {canView ? <>
      <ChallengeSections rows={challengeRows} viewerId={user.userId} canManage={canManageChallenges} title={`${name}'s challenges`}/>
      <div className="section-title collection-title"><div><p className="eyebrow">SAVED GAMES</p><h2>Library</h2></div></div>
      {games.length ? <PublicLibrary games={displayGames} recipientId={targetId} viewerId={user.userId} challengeRows={challengeRows} canManageChallenges={canManageChallenges} canCreateChallenges={hasPermission(user, friendship?.status === "accepted")}/> : <div className="empty-state"><h2>No games saved yet</h2></div>}
    </> : <div className="empty-state"><h2>Private profile</h2><p>Send a friend request to see this player&apos;s games and challenges after they accept.</p></div>}
  </div></main>;
}
