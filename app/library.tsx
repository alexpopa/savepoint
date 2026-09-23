"use client";

import { useEffect, useState } from "react";
import { Gamepad2, Library as LibraryIcon, LoaderCircle, Trash2, X } from "lucide-react";
import SiteHeader from "./site-header";

type Game = { id: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platforms: string[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}

export default function Library({ email }: { email: string }) {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { api<{ games: Game[] }>("/api/library").then(({ games }) => setGames(games)).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);

  async function removeGame(id: number) {
    try { await api(`/api/library/${id}`, { method: "DELETE" }); setGames((all) => all.filter((game) => game.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove game."); }
  }

  return <main className="library-page">
    <SiteHeader email={email}/>
    <div className="library-wrap"><div className="page-heading"><div><p className="eyebrow"><LibraryIcon size={14} /> YOUR PERSONAL CATALOG</p><h1>Game library</h1><p className="subcopy">Keep track of the games you want to remember.</p></div><div className="game-count"><strong>{games.length.toString().padStart(2, "0")}</strong><span>GAMES<br />COLLECTED</span></div></div>
      {error && <div className="notice error"><X size={17} />{error}</div>}
      <div className="section-title collection-title"><div><p className="eyebrow">YOUR SAVED GAMES</p><h2>Collection</h2></div><div className="sort-label">Newest first</div></div>
      {loading ? <div className="empty-state"><LoaderCircle className="spin" size={22}/><p>Loading your library…</p></div> : games.length === 0 ? <div className="empty-state"><div className="empty-icon"><Gamepad2 size={27}/></div><h2>Your library is ready</h2><p>Use the search bar above to find a game and add it here.</p></div> : <div className="game-grid library-grid">{games.map((game) => <article className="game-card" key={game.id}><GameCover game={game}/><div className="game-info"><h3>{game.name}</h3><p>{[game.releaseYear, game.platforms.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "Release year unknown"}</p></div><button className="remove-button" aria-label={`Remove ${game.name}`} title="Remove from library" onClick={() => void removeGame(game.id)}><Trash2 size={16}/></button></article>)}</div>}
      <footer className="page-footer"><span>Game information and covers powered by IGDB.</span><span>YOUR LIBRARY · {games.length} TITLES</span></footer>
    </div>
  </main>;
}

function GameCover({ game }: { game: Game }) {
  return <div className="game-cover">{game.coverUrl ? <img src={game.coverUrl} alt={`${game.name} cover`} loading="lazy"/> : <div className="cover-fallback"><Gamepad2 size={29}/><span>{game.name.slice(0, 1)}</span></div>}</div>;
}
