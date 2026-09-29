"use client";

import { useEffect, useState } from "react";
import { Gamepad2, Library as LibraryIcon, LoaderCircle, Play, X } from "lucide-react";
import SiteHeader from "./site-header";
import { GameChallenges } from "./challenges";
import GameDetailsDialog from "./game-details-dialog";
import type { Challenge } from "../lib/challenges";
import type { CatalogGame, SavedGame } from "../lib/game-types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}

export default function Library({ email, userId }: { email: string; userId: string }) {
  const [games, setGames] = useState<SavedGame[]>([]);
  const [selected, setSelected] = useState<CatalogGame | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyGame, setBusyGame] = useState<number | null>(null);

  useEffect(() => { api<{ games: SavedGame[] }>("/api/library").then(({ games }) => setGames(games)).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { api<{ challenges: Challenge[] }>("/api/challenges?scope=received").then(({ challenges }) => setChallenges(challenges)).catch((e) => setError(e.message)); }, []);

  async function refreshGames() {
    const data = await api<{ games: SavedGame[] }>("/api/library");
    setGames(data.games);
  }

  async function removeGame(id: number) {
    await api(`/api/library/${id}`, { method: "DELETE" });
    await refreshGames();
  }

  async function addGame(igdbId: number, platformId: number) {
    await api("/api/library", { method: "POST", body: JSON.stringify({ igdbId, platformId }) });
    await refreshGames();
  }

  async function setPlaying(id: number, playing: boolean) {
    await api(`/api/library/${id}/playing`, { method: playing ? "PUT" : "DELETE" });
    await refreshGames();
  }

  async function togglePlaying(game: SavedGame) {
    setBusyGame(game.id); setError("");
    try { await setPlaying(game.id, !game.playingSince); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not update currently playing."); }
    finally { setBusyGame(null); }
  }

  const selectedCopies = selected ? games.filter((game) => game.igdbId === selected.igdbId) : [];

  return <main className="library-page">
    <SiteHeader email={email}/>
    <div className="library-wrap"><div className="page-heading"><div><p className="eyebrow"><LibraryIcon size={14} /> YOUR PERSONAL CATALOG</p><h1>Game library</h1><p className="subcopy">Keep track of the games you want to remember.</p></div><div className="game-count"><strong>{games.length.toString().padStart(2, "0")}</strong><span>PLATFORM<br />COPIES</span></div></div>
      {error && <div className="notice error"><X size={17} />{error}</div>}
      <div className="section-title collection-title"><div><p className="eyebrow">YOUR SAVED GAMES</p><h2>Collection</h2></div><div className="sort-label">Newest first</div></div>
      {loading ? <div className="empty-state"><LoaderCircle className="spin" size={22}/><p>Loading your library…</p></div> : games.length === 0 ? <div className="empty-state"><div className="empty-icon"><Gamepad2 size={27}/></div><h2>Your library is ready</h2><p>Use the search bar above to find a game and add it here.</p></div> : <div className="game-grid library-grid">{games.map((game) => {
        const openGame = () => setSelected({ ...game, platformOptions: [] });
        return <article className="game-card challenge-game-card" key={game.id}><button type="button" className="game-card-open" aria-label={`View details and platform options for ${game.name} on ${game.platformName || "an unspecified platform"}`} onClick={openGame}><GameCover game={game}/><div className="game-info"><h3>{game.name}</h3><p>{game.releaseYear || "Year unknown"}</p><span className="game-platform-label"><Gamepad2 size={14}/>{game.platformName || "Platform not set"}</span>{game.playingSince ? <span className="game-owned-label playing-label"><Play size={13} fill="currentColor" aria-hidden="true"/>Currently playing</span> : null}</div></button><button type="button" className="add-button playing-toggle" aria-pressed={Boolean(game.playingSince)} aria-label={`Currently playing ${game.name} on ${game.platformName || "an unspecified platform"}`} title={game.playingSince ? "Stop playing" : "Mark as currently playing"} disabled={busyGame === game.id} onClick={() => void togglePlaying(game)}><Play size={18} fill={game.playingSince ? "currentColor" : "none"} aria-hidden="true"/></button><GameChallenges game={game} recipientId={userId} viewerId={userId} rows={challenges}/></article>;
      })}</div>}
      {selected && <GameDetailsDialog key={selected.igdbId} game={selected} saved={selectedCopies} signedIn onClose={() => setSelected(null)} onAdd={(platformId) => addGame(selected.igdbId, platformId)} onRemove={removeGame} onPlaying={setPlaying}/>}
      <footer className="page-footer"><span>Game information and covers powered by IGDB.</span><span>YOUR LIBRARY · {games.length} COPIES</span></footer>
    </div>
  </main>;
}

function GameCover({ game }: { game: SavedGame }) {
  return <div className="game-cover">{game.coverUrl ? <img src={game.coverUrl} alt={`${game.name} cover`} loading="lazy"/> : <div className="cover-fallback"><Gamepad2 size={29}/><span>{game.name.slice(0, 1)}</span></div>}</div>;
}
