"use client";

import { useEffect, useState } from "react";
import { Check, Gamepad2, LoaderCircle, Plus, Search, UserPlus, Users } from "lucide-react";
import FriendButton, { type Relationship } from "../friend-button";

type Game = { igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platforms: string[] };
type Player = { userId: string; displayName: string; isPublic: boolean; relationship: Relationship };
type Tab = "all" | "games" | "players";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function SearchResults({ query, signedIn }: { query: string; signedIn: boolean }) {
  const [tab, setTab] = useState<Tab>("all");
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [busyGame, setBusyGame] = useState<number | null>(null);
  const [gamesError, setGamesError] = useState("");
  const [playersError, setPlayersError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  useEffect(() => {
    if (query.length < 2 || query.length > 100) return;
    let active = true;
    const q = encodeURIComponent(query);
    void api<{ games: Game[] }>(`/api/igdb/search?q=${q}`).then((data) => { if (active) setGames(data.games); })
      .catch((error) => { if (active) setGamesError(error.message); }).finally(() => { if (active) setLoadingGames(false); });
    void api<{ players: Player[] }>(`/api/players/search?q=${q}`).then((data) => { if (active) setPlayers(data.players); })
      .catch((error) => { if (active) setPlayersError(error.message); }).finally(() => { if (active) setLoadingPlayers(false); });
    if (signedIn) void api<{ games: Game[] }>("/api/library").then((data) => { if (active) setSaved(new Set(data.games.map((game) => game.igdbId))); }).catch(() => {});
    return () => { active = false; };
  }, [query, signedIn]);

  async function addGame(game: Game) {
    setBusyGame(game.igdbId); setActionError("");
    try {
      await api("/api/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ igdbId: game.igdbId }) });
      setSaved((current) => new Set(current).add(game.igdbId));
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not add game."); }
    finally { setBusyGame(null); }
  }

  const valid = query.length >= 2 && query.length <= 100;
  const showPlayers = tab !== "games";
  const showGames = tab !== "players";
  const done = !loadingGames && !loadingPlayers;
  const loginPath = `/login?return_to=${encodeURIComponent(`/search?q=${encodeURIComponent(query)}`)}`;
  return <div className="library-wrap search-wrap">
    <p className="eyebrow"><Search size={14}/> DISCOVER RGBONER</p>
    <h1>Search</h1>
    <p className="subcopy">Find games to save and players to connect with.</p>
    {!valid ? <div className="empty-state"><Search size={28}/><h2>Search games and players</h2><p>Enter at least two characters in the search bar above.</p></div> : <>
      <p className="search-summary">Results for <strong>“{query}”</strong></p>
      <div className="search-tabs" role="tablist" aria-label="Result type">
        {(["all", "games", "players"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value === "all" ? <Search size={15}/> : value === "games" ? <Gamepad2 size={16}/> : <Users size={16}/>} {value === "all" ? "All" : value === "games" ? `Games${loadingGames ? "" : ` ${games.length}`}` : `Players${loadingPlayers ? "" : ` ${players.length}`}`}</button>)}
      </div>
      {actionError && <div className="notice error search-notice" role="alert">{actionError}</div>}
      {showPlayers && <section className="search-group" aria-labelledby="players-heading"><div className="search-group-heading"><div><p className="eyebrow">COMMUNITY</p><h2 id="players-heading">Players</h2></div><span>{loadingPlayers ? "Searching…" : `${players.length} found`}</span></div>
        {loadingPlayers ? <div className="search-loading"><LoaderCircle className="spin" size={18}/> Searching players…</div> : playersError ? <div className="search-empty" role="alert">{playersError}</div> : players.length ? <div className="search-player-list">{players.map((player) => {
          const profilePath = `/users/${encodeURIComponent(player.userId)}`;
          return <article className="search-player" key={player.userId}>
            <a href={signedIn ? profilePath : `/login?return_to=${encodeURIComponent(profilePath)}`} className="search-player-main"><span className="account-avatar">{player.displayName.charAt(0).toUpperCase()}</span><span><strong>{player.displayName}</strong><small>{player.isPublic ? "Public library" : player.relationship?.status === "accepted" ? "Private library · Friend" : "Private library"}</small></span></a>
            <div className="search-player-actions"><a className="view-profile" href={signedIn ? profilePath : `/login?return_to=${encodeURIComponent(profilePath)}`}>{signedIn ? "View profile" : "Sign in to view"}</a>{signedIn ? <FriendButton userId={player.userId} initialRelationship={player.relationship}/> : <a className="friend-button" href={loginPath}><UserPlus size={16}/> Sign in to add friend</a>}</div>
          </article>;
        })}</div> : <div className="search-empty">No players matched “{query}”.</div>}
      </section>}
      {showGames && <section className="search-group" aria-labelledby="games-heading"><div className="search-group-heading"><div><p className="eyebrow">IGDB CATALOG</p><h2 id="games-heading">Games</h2></div><span>{loadingGames ? "Searching…" : `${games.length} found`}</span></div>
        {loadingGames ? <div className="search-loading"><LoaderCircle className="spin" size={18}/> Searching games…</div> : gamesError ? <div className="search-empty" role="alert">{gamesError}</div> : games.length ? <div className="game-grid">{games.map((game) => <article className="game-card result-card" key={game.igdbId}><div className="game-cover">{game.coverUrl ? <img src={game.coverUrl} alt={`${game.name} cover`} loading="lazy"/> : <div className="cover-fallback"><Gamepad2 size={25}/></div>}</div><div className="game-info"><h3>{game.name}</h3><p>{[game.releaseYear, game.platforms.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "Release year unknown"}</p></div>{signedIn ? <button type="button" className="add-button" aria-label={saved.has(game.igdbId) ? `${game.name} is in your library` : `Add ${game.name} to your library`} title={saved.has(game.igdbId) ? "In your library" : "Add to library"} disabled={saved.has(game.igdbId) || busyGame === game.igdbId} onClick={() => void addGame(game)}>{busyGame === game.igdbId ? <LoaderCircle className="spin" size={18}/> : saved.has(game.igdbId) ? <Check size={18}/> : <Plus size={18}/>}</button> : <a className="add-button" href={loginPath} aria-label={`Sign in to add ${game.name} to your library`} title="Sign in to add to library"><Plus size={18}/></a>}</article>)}</div> : <div className="search-empty">No games matched “{query}”.</div>}
      </section>}
      {done && !gamesError && !playersError && games.length === 0 && players.length === 0 && <p className="search-tip">Try a shorter name or a different spelling.</p>}
    </>}
  </div>;
}
