"use client";

import { useEffect, useState } from "react";
import { Gamepad2, Flag, Check, ArrowUpRight, ChevronRight, Play, Star } from "lucide-react";
import { ChallengeDetailsDialog, TimelineChallengeButton } from "./challenges";
import GameDetailsDialog from "./game-details-dialog";
import SiteHeader from "./site-header";
import type { TimelineGame, TimelineItem } from "../lib/timeline-items";
import type { CatalogGame, SavedGame } from "../lib/game-types";
import type { ChallengeDetails } from "../lib/challenges";

function Cover({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className="timeline-cover">{src && !failed
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <Gamepad2 size={24} aria-hidden="true" />}</span>;
}

function Game({ game, onOpen }: { game: TimelineGame; onOpen: (game: TimelineGame) => void }) {
  return <li className="timeline-game"><Cover src={game.coverUrl} /><span className="timeline-game-copy"><button type="button" className="timeline-game-title" aria-label={`View details and platform options for ${game.name}`} onClick={() => onOpen(game)}>{game.name}</button><small>{game.platformName || "Platform not set"}</small></span><TimelineChallengeButton game={game} recipientId={game.person.id}/></li>;
}

function Stamp({ at, updated }: { at: number; updated?: boolean }) {
  const date = new Date(at);
  return <time dateTime={date.toISOString()} title={date.toUTCString()}>{updated ? "Updated " : ""}{date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>;
}

export default function Timeline({ email, viewerId, items, error = false }: { email: string; viewerId: string; items: TimelineItem[]; error?: boolean }) {
  const [selectedGame, setSelectedGame] = useState<CatalogGame | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeDetails | null>(null);
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  useEffect(() => {
    void request<{ games: SavedGame[] }>("/api/library").then(({ games }) => setSavedGames(games)).catch(() => {});
  }, []);

  async function refreshSavedGames() {
    const { games } = await request<{ games: SavedGame[] }>("/api/library");
    setSavedGames(games);
  }

  async function addGame(igdbId: number, platformId: number) {
    await request("/api/library", { method: "POST", body: JSON.stringify({ igdbId, platformId }) });
    await refreshSavedGames();
  }

  async function removeGame(id: number) {
    await request(`/api/library/${id}`, { method: "DELETE" });
    await refreshSavedGames();
  }

  async function setPlaying(id: number, playing: boolean) {
    await request(`/api/library/${id}/playing`, { method: playing ? "PUT" : "DELETE" });
    await refreshSavedGames();
  }

  function openGame(game: Pick<TimelineGame, "igdbId" | "name" | "coverUrl" | "releaseYear">) {
    setSelectedGame({
      igdbId: game.igdbId,
      name: game.name,
      coverUrl: game.coverUrl,
      releaseYear: game.releaseYear,
      platforms: [],
      platformOptions: [],
    });
  }

  function openChallenge(item: Extract<TimelineItem, { kind: "challenge" }>) {
    setSelectedChallenge({
      id: item.id,
      creatorId: item.creator.id,
      recipientId: item.recipient.id,
      creatorName: item.creator.name,
      recipientName: item.recipient.name,
      creatorProfilePath: item.creator.href,
      recipientProfilePath: item.recipient.href,
      gameName: item.gameName,
      gameCoverUrl: item.coverUrl,
      title: item.title,
      description: item.description,
    });
  }

  return <div className="library-page"><SiteHeader email={email} />
    <main className="timeline-wrap">
      <header className="timeline-heading"><div><p className="timeline-eyebrow"><span className="timeline-rgb" aria-hidden="true" />Your circle</p><h1>Recent activity</h1></div><a className="timeline-players" href="/users">Find players <ArrowUpRight size={16} aria-hidden="true" /></a></header>
      <section className="timeline-screen" aria-label="Recent friend activity">
        <div className="timeline-screen-label"><span>Friends / latest</span><span>{String(items.length).padStart(2, "0")} entries</span></div>
        {error ? <div className="timeline-empty" role="alert"><h2>Activity couldn’t load.</h2><p>Please try again in a moment.</p><a href="/">Try again</a></div>
          : items.length === 0 ? <div className="timeline-empty"><Gamepad2 size={32} aria-hidden="true" /><h2>A quiet moment.</h2><p>New games, favorites, games they’re playing, and challenge updates from your friends will appear here.</p><a href="/users">Find your friends <ArrowUpRight size={16} aria-hidden="true" /></a></div>
          : <ol className="timeline-list">{items.map((item) => <li key={item.key} className={`timeline-entry ${item.kind === "challenge" ? `is-${item.state}` : "is-library"}`}>
            <span className="timeline-marker" aria-hidden="true">{item.kind === "library" ? <Gamepad2 size={18} /> : item.kind === "favorite" ? <Star size={18}/> : item.kind === "playing" ? <Play size={18}/> : item.state === "completed" ? <Check size={18} /> : <Flag size={18} />}</span>
            <article>
              <div className="timeline-entry-heading"><h2>{item.kind === "library" ? <><a href={item.person.href}>{item.person.name}</a> added {item.games.length === 1 ? "a game" : `${item.games.length} games`}</> : item.kind === "favorite" ? <><a href={item.person.href}>{item.person.name}</a> favorited a game</> : item.kind === "playing" ? <><a href={item.person.href}>{item.person.name}</a> started playing</> : <><a href={item.creator.href}>{item.creator.name}</a><span className="timeline-versus"> challenged </span><a href={item.recipient.href}>{item.recipient.name}</a></>}</h2><Stamp at={item.at} updated={item.kind === "challenge" && item.at !== item.createdAt} /></div>
              {item.kind === "library" ? <><ul className="timeline-games">{item.games.slice(0, 4).map((game) => <Game key={game.id} game={game} onOpen={openGame}/>)}</ul>{item.games.length > 4 && <details className="timeline-more"><summary>Show {item.games.length - 4} more games</summary><ul className="timeline-games">{item.games.slice(4).map((game) => <Game key={game.id} game={game} onOpen={openGame}/>)}</ul></details>}</>
                : item.kind === "playing" ? <div className="timeline-game"><button type="button" className="timeline-challenge-cover-open" onClick={() => openGame(item)} aria-label={`Open ${item.name} details`}><Cover src={item.coverUrl}/></button><span className="timeline-game-copy"><button type="button" className="timeline-game-title" onClick={() => openGame(item)} aria-label={`View details for ${item.name}`}>{item.name}</button><small>{item.platformName || "Platform not set"}</small></span></div>
                : item.kind === "favorite" ? <div className="timeline-game"><button type="button" className="timeline-challenge-cover-open" onClick={() => openGame(item)} aria-label={`Open ${item.name} details`}><Cover src={item.coverUrl}/></button><button type="button" className="timeline-game-title" onClick={() => openGame(item)} aria-label={`View details for ${item.name}`}>{item.name}</button></div>
                : <div className="timeline-challenge"><button type="button" className="timeline-challenge-cover-open" aria-label={`View details for ${item.title} challenge`} onClick={() => openChallenge(item)}><Cover src={item.coverUrl} /></button><div><p className="timeline-state">{item.state === "completed" ? "Challenge completed" : item.state === "claimed" ? `${item.recipient.name} marked it complete` : "Challenge pending"}</p><button type="button" className="timeline-challenge-open" aria-label={`Open ${item.title} challenge details`} onClick={() => openChallenge(item)}><span className="timeline-challenge-title" role="heading" aria-level={3}>{item.title}</span><ChevronRight size={19} aria-hidden="true"/><span className="timeline-game-name">{item.gameName}</span></button></div></div>}
            </article>
          </li>)}</ol>}
      </section>
      {items.length > 0 && <p className="timeline-end">You’re caught up with the latest activity.</p>}
    </main>
    {selectedGame && <GameDetailsDialog key={selectedGame.igdbId} game={selectedGame} saved={savedGames.filter((game) => game.igdbId === selectedGame.igdbId)} signedIn onClose={() => setSelectedGame(null)} onAdd={(platformId) => addGame(selectedGame.igdbId, platformId)} onRemove={removeGame} onPlaying={setPlaying}/>}
    {selectedChallenge && <ChallengeDetailsDialog row={selectedChallenge} viewerId={viewerId} onClose={() => setSelectedChallenge(null)}/>}
  </div>;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}
