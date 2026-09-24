import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import SiteHeader from "../../site-header";
import FriendButton from "../../friend-button";
import { ChallengeSections, GameChallenges } from "../../challenges";
import { requireUser } from "../../auth";
import { getDb } from "../../../db";
import { accounts, libraryItems } from "../../../db/schema";
import { receivedChallenges } from "../../../lib/challenges";
import { accountDisplayName, ensureAccount, getFriendship, serializeGame } from "../../../lib/social";

export const dynamic = "force-dynamic";

export default async function UserLibraryPage({ params }: { params: Promise<{ userId: string }> }) {
  const targetId = (await params).userId;
  const user = await requireUser(`/users/${encodeURIComponent(targetId)}`);
  await ensureAccount(user);
  if (targetId === user.userId) redirect("/profile");
  const [target] = await getDb().select().from(accounts).where(eq(accounts.userId, targetId));
  if (!target?.passwordHash || !target.emailVerifiedAt) notFound();
  const friendship = await getFriendship(user.userId, targetId);
  const canView = target.isPublic || friendship?.status === "accepted";
  const [games, challengeRows] = canView ? await Promise.all([
    getDb().select().from(libraryItems).where(eq(libraryItems.userId, targetId)).orderBy(desc(libraryItems.addedAt)).then((rows) => rows.map(serializeGame)),
    receivedChallenges(targetId),
  ]) : [[], []];
  const relationship = friendship ? { status: friendship.status, direction: friendship.requesterId === user.userId ? "outgoing" as const : "incoming" as const } : null;
  const name = accountDisplayName(target);
  return <main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap">
    <div className="page-heading"><div><p className="eyebrow">{target.isPublic ? "PUBLIC PROFILE" : canView ? "FRIEND PROFILE" : "PRIVATE PROFILE"}</p><h1>{name}&apos;s profile</h1><p className="subcopy">{canView ? "Games and challenges shared by this player." : "This profile is private. Become friends to see their games and challenges."}</p>{friendship?.status !== "accepted" && <div className="profile-friend-action"><FriendButton userId={targetId} initialRelationship={relationship} refreshOnAccept/></div>}</div>{canView && <div className="game-count"><strong>{games.length.toString().padStart(2, "0")}</strong><span>PLATFORM<br/>COPIES</span></div>}</div>
    {canView ? <>
      <ChallengeSections rows={challengeRows} viewerId={user.userId} title={`${name}'s challenges`}/>
      <div className="section-title collection-title"><div><p className="eyebrow">SAVED GAMES</p><h2>Library</h2></div></div>
      {games.length ? <div className="game-grid library-grid">{games.map((game) => <article className="game-card challenge-game-card" key={game.id}><div className="game-cover">{game.coverUrl ? <img src={game.coverUrl} alt={`${game.name} cover`} loading="lazy"/> : <div className="cover-fallback"><Gamepad2 size={29}/><span>{game.name.slice(0, 1)}</span></div>}</div><div className="game-info"><h3>{game.name}</h3><p>{game.releaseYear || "Year unknown"}</p><span className="game-platform-label"><Gamepad2 size={14}/>{game.platformName || "Platform not set"}</span></div><GameChallenges game={game} recipientId={targetId} viewerId={user.userId} rows={challengeRows} canCreate={friendship?.status === "accepted"}/></article>)}</div> : <div className="empty-state"><h2>No games saved yet</h2></div>}
    </> : <div className="empty-state"><h2>Private profile</h2><p>Send a friend request to see this player&apos;s games and challenges after they accept.</p></div>}
  </div></main>;
}
