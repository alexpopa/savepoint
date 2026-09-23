"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Gamepad2, Library as LibraryIcon, LoaderCircle, LogOut, Plus, Search, Trash2, X } from "lucide-react";

type Game = { id: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platforms: string[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}

export default function Library({ email, signOutPath }: { email: string; signOutPath: string }) {
  const [games, setGames] = useState<Game[]>([]);
  const [results, setResults] = useState<Game[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api<{ games: Game[] }>("/api/library").then(({ games }) => setGames(games)).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);

  async function searchGames(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (query.trim().length < 2) return;
    setSearching(true); setError("");
    try { const result = await api<{ games: Game[] }>(`/api/igdb/search?q=${encodeURIComponent(query.trim())}`); setResults(result.games); }
    catch (e) { setError(e instanceof Error ? e.message : "Search failed."); }
    finally { setSearching(false); }
  }

  async function addGame(game: Game) {
    setError("");
    try { await api("/api/library", { method: "POST", body: JSON.stringify({ igdbId: game.igdbId }) }); setResults((all) => all.filter((item) => item.igdbId !== game.igdbId)); const saved = await api<{ games: Game[] }>("/api/library"); setGames(saved.games); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not add game."); }
  }

  async function removeGame(id: number) {
    try { await api(`/api/library/${id}`, { method: "DELETE" }); setGames((all) => all.filter((game) => game.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove game."); }
  }

  const alreadyAdded = new Set(games.map((game) => game.igdbId));
  return <main className="library-page">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark"><Gamepad2 size={21} /></span><span>savepoint</span></a><div className="account"><span className="account-avatar">{email.charAt(0).toUpperCase()}</span><span>{email}</span><a className="icon-button" aria-label="Sign out" title="Sign out" href={signOutPath} target="_top"><LogOut size={17} /></a></div></header>
    <div className="library-wrap"><div className="page-heading"><div><p className="eyebrow"><LibraryIcon size={14} /> YOUR PERSONAL CATALOG</p><h1>Game library</h1><p className="subcopy">Keep track of the games you want to remember.</p></div><div className="game-count"><strong>{games.length.toString().padStart(2, "0")}</strong><span>GAMES<br />COLLECTED</span></div></div>
      <form className="search-box" onSubmit={searchGames}><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the IGDB catalog…" aria-label="Search games in the IGDB catalog"/><button type="submit" disabled={searching || query.trim().length < 2}>{searching ? <LoaderCircle className="spin" size={18} /> : <>Find games <ArrowRight size={16}/></>}</button></form>
      {error && <div className="notice error"><X size={17} />{error}</div>}
      {results.length > 0 && <section className="results-section"><div className="section-title"><div><p className="eyebrow">IGDB RESULTS</p><h2>Add to your library</h2></div><button className="text-button" onClick={() => setResults([])}>Clear <X size={15}/></button></div><div className="game-grid">{results.map((game) => <article className="game-card result-card" key={game.igdbId}><GameCover game={game}/><div className="game-info"><h3>{game.name}</h3><p>{[game.releaseYear, game.platforms.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "Release year unknown"}</p></div><button className="add-button" aria-label={`Add ${game.name}`} onClick={() => void addGame(game)} disabled={alreadyAdded.has(game.igdbId)}>{alreadyAdded.has(game.igdbId) ? <Check size={19}/> : <Plus size={19}/>}</button></article>)}</div></section>}
      <div className="section-title collection-title"><div><p className="eyebrow">YOUR SAVED GAMES</p><h2>Collection</h2></div><div className="sort-label">Newest first</div></div>
      {loading ? <div className="empty-state"><LoaderCircle className="spin" size={22}/><p>Loading your library…</p></div> : games.length === 0 ? <div className="empty-state"><div className="empty-icon"><Gamepad2 size={27}/></div><h2>Your library is ready</h2><p>Search IGDB above to find a game and add it here.</p></div> : <div className="game-grid library-grid">{games.map((game) => <article className="game-card" key={game.id}><GameCover game={game}/><div className="game-info"><h3>{game.name}</h3><p>{[game.releaseYear, game.platforms.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "Release year unknown"}</p></div><button className="remove-button" aria-label={`Remove ${game.name}`} title="Remove from library" onClick={() => void removeGame(game.id)}><Trash2 size={16}/></button></article>)}</div>}
      <footer className="page-footer"><span>Game information and covers powered by IGDB.</span><span>YOUR LIBRARY · {games.length} TITLES</span></footer>
    </div>
  </main>;
}

function GameCover({ game }: { game: Game }) {
  return <div className="game-cover">{game.coverUrl ? <img src={game.coverUrl} alt={`${game.name} cover`} loading="lazy"/> : <div className="cover-fallback"><Gamepad2 size={29}/><span>{game.name.slice(0, 1)}</span></div>}</div>;
}
