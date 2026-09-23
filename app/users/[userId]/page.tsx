import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import SiteHeader from "../../site-header";
import FriendButton from "../../friend-button";
import { requireChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { accounts, libraryItems } from "../../../db/schema";
import { accountDisplayName, ensureAccount, getFriendship, serializeGame } from "../../../lib/social";

export const dynamic = "force-dynamic";

export default async function UserLibraryPage({ params }: { params: Promise<{ userId: string }> }) {
  const targetId = (await params).userId;
  const user = await requireChatGPTUser(`/users/${encodeURIComponent(targetId)}`);
  await ensureAccount(user);
  if (targetId === user.userId) redirect("/");
  const [target] = await getDb().select().from(accounts).where(eq(accounts.userId, targetId));
  if (!target) notFound();
  const friendship = await getFriendship(user.userId, targetId);
  const canView = target.isPublic || friendship?.status === "accepted";
  const games = canView
    ? (await getDb().select().from(libraryItems).where(eq(libraryItems.userId, targetId)).orderBy(desc(libraryItems.addedAt))).map(serializeGame)
    : [];
  const relationship = friendship ? { status: friendship.status, direction: friendship.requesterId === user.userId ? "outgoing" as const : "incoming" as const } : null;
  const name = accountDisplayName(target);
  return <main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap"><div className="page-heading"><div><p className="eyebrow">{target.isPublic ? "PUBLIC LIBRARY" : canView ? "FRIEND LIBRARY" : "PRIVATE LIBRARY"}</p><h1>{name}&apos;s games</h1><p className="subcopy">{canView ? "Games saved to this library." : "This library is private. Become friends to see their games."}</p>{friendship?.status !== "accepted" && <div className="profile-friend-action"><FriendButton userId={targetId} initialRelationship={relationship} refreshOnAccept/></div>}</div>{canView && <div className="game-count"><strong>{games.length.toString().padStart(2, "0")}</strong><span>GAMES<br/>COLLECTED</span></div>}</div>{canView ? games.length ? <div className="game-grid library-grid">{games.map((game) => <article className="game-card" key={game.id}><div className="game-cover">{game.coverUrl ? <img src={game.coverUrl} alt={`${game.name} cover`} loading="lazy"/> : <div className="cover-fallback"><Gamepad2 size={29}/><span>{game.name.slice(0, 1)}</span></div>}</div><div className="game-info"><h3>{game.name}</h3><p>{[game.releaseYear, game.platforms.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "Release year unknown"}</p></div></article>)}</div> : <div className="empty-state"><h2>No games saved yet</h2></div> : <div className="empty-state"><h2>Private library</h2><p>Send a friend request to see this player&apos;s games after they accept.</p></div>}</div></main>;
}
