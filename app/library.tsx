"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Gamepad2, Library as LibraryIcon, LoaderCircle, Play, Search, X } from "lucide-react";
import SiteHeader from "./site-header";
import { GameChallenges } from "./challenges";
import GameDetailsDialog from "./game-details-dialog";
import { ScoreStars } from "./game-rating";
import PlatformFilter, { type Platform } from "./platform-filter";
import type { Challenge } from "../lib/challenges";
import type { CatalogGame, SavedGame } from "../lib/game-types";
import { filterLibraryGames, librarySorts, paginateLibraryGames, sortLibraryGames, type LibrarySort } from "../lib/library-view";

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
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [busyGame, setBusyGame] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [platformIds, setPlatformIds] = useState<number[]>([]);
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [page, setPage] = useState(1);
  const pageStatus = useRef<HTMLParagraphElement>(null);

  useEffect(() => { api<{ games: SavedGame[] }>("/api/library").then(({ games }) => setGames(games)).catch((e) => { setError(e.message); setLibraryFailed(true); }).finally(() => setLoading(false)); }, []);
  useEffect(() => { api<{ challenges: Challenge[] }>("/api/challenges?scope=received").then(({ challenges }) => setChallenges(challenges)).catch((e) => setError(e.message)); }, []);

  async function refreshGames() {
    const data = await api<{ games: SavedGame[] }>("/api/library");
    setGames(data.games);
    setPlatformIds((current) => current.filter((id) => data.games.some((game) => game.platformId === id)));
    setPage((current) => paginateLibraryGames(filterLibraryGames(data.games, query, platformIds), current).page);
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

  async function toggleCompleted(game: SavedGame) {
    setBusyGame(game.id); setError("");
    try {
      await api(`/api/library/${game.id}/completed`, { method: game.completedAt ? "DELETE" : "PUT" });
      await refreshGames();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update this game."); }
    finally { setBusyGame(null); }
  }

  const selectedCopies = selected ? games.filter((game) => game.igdbId === selected.igdbId) : [];
  const platforms: Platform[] = [...new Map(games.map((game) => [game.platformId, { id: game.platformId, name: game.platformName || "Platform not set" }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const matching = sortLibraryGames(filterLibraryGames(games, query, platformIds), sort);
  const { items: visible, page: currentPage, pageCount, first, last } = paginateLibraryGames(matching, page);
  const filtered = Boolean(query.trim() || platformIds.length);

  function changePage(next: number) {
    setPage(next);
    requestAnimationFrame(() => {
      pageStatus.current?.focus({ preventScroll: true });
      pageStatus.current?.scrollIntoView({ block: "start" });
    });
  }

  return <main className="library-page">
    <SiteHeader email={email}/>
    <div className="library-wrap"><div className="page-heading"><div><p className="eyebrow"><LibraryIcon size={14} /> YOUR PERSONAL CATALOG</p><h1>Game library</h1><p className="subcopy">Keep track of the games you want to remember.</p></div><div className="game-count"><strong>{games.length.toString().padStart(2, "0")}</strong><span>PLATFORM<br />COPIES</span></div></div>
      {error && <div className="notice error"><X size={17} />{error}</div>}
      <div className="section-title collection-title"><div><p className="eyebrow">YOUR SAVED GAMES</p><h2>Collection</h2></div></div>
      {!loading && !libraryFailed && games.length > 0 && <><div className="library-tools">
        <label className="library-search"><span>Search your games</span><span className="library-search-field"><Search size={17} aria-hidden="true"/><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search titles" maxLength={100} autoComplete="off" spellCheck={false}/></span></label>
        <PlatformFilter platforms={platforms} selected={platformIds} onChange={(ids) => { setPlatformIds(ids); setPage(1); }} className="is-end"/>
        <LibrarySortSelect value={sort} onChange={(next) => { setSort(next); setPage(1); }}/>
      </div><p ref={pageStatus} className="library-results" role="status" tabIndex={-1}>{matching.length ? `Showing ${first}–${last} of ${matching.length} ${filtered ? "matching " : ""}${matching.length === 1 ? "copy" : "copies"}` : "No matching copies"}</p></>}
      {loading ? <div className="empty-state"><LoaderCircle className="spin" size={22}/><p>Loading your library…</p></div> : libraryFailed ? null : games.length === 0 ? <div className="empty-state"><div className="empty-icon"><Gamepad2 size={27}/></div><h2>Your library is ready</h2><p>Use the search bar above to find a game and add it here.</p></div> : matching.length === 0 ? <div className="empty-state"><div className="empty-icon"><Search size={27}/></div><h2>No games match</h2><p>Try another title or platform.</p><button type="button" className="library-clear" onClick={() => { setQuery(""); setPlatformIds([]); setPage(1); }}>Clear filters</button></div> : <div className="game-grid library-grid">{visible.map((game) => {
        const openGame = () => setSelected({ ...game, platformOptions: [] });
        return <article className="game-card challenge-game-card" key={game.id}><button type="button" className="game-card-open" aria-label={`View details and platform options for ${game.name} on ${game.platformName || "an unspecified platform"}`} onClick={openGame}><GameCover game={game}/><div className="game-info"><h3>{game.name}</h3><p>{game.releaseYear || "Year unknown"}</p><span className="game-platform-label"><Gamepad2 size={14}/>{game.platformName || "Platform not set"}</span>{game.score ? <ScoreStars score={game.score} className="game-card-score"/> : null}</div></button><div className="card-toggles"><button type="button" className="add-button playing-toggle" aria-pressed={Boolean(game.playingSince)} aria-label={`Currently playing ${game.name} on ${game.platformName || "an unspecified platform"}`} title={game.playingSince ? "Stop playing" : "Mark as currently playing"} disabled={busyGame === game.id} onClick={() => void togglePlaying(game)}><Play size={18} fill={game.playingSince ? "currentColor" : "none"} aria-hidden="true"/></button><button type="button" className="add-button playing-toggle completed-toggle" aria-pressed={Boolean(game.completedAt)} aria-label={`Completed ${game.name} on ${game.platformName || "an unspecified platform"}`} title={game.completedAt ? "Mark as not completed" : "Mark as completed"} disabled={busyGame === game.id} onClick={() => void toggleCompleted(game)}><CircleCheck size={18} aria-hidden="true"/></button></div><GameChallenges game={game} recipientId={userId} viewerId={userId} rows={challenges}/></article>;
      })}</div>}
      {!loading && pageCount > 1 && <nav className="library-pagination" aria-label="Library pages"><span>Page {currentPage} of {pageCount}</span><div><button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>Next</button></div></nav>}
      {selected && <GameDetailsDialog key={selected.igdbId} game={selected} saved={selectedCopies} signedIn onClose={() => setSelected(null)} onAdd={(platformId) => addGame(selected.igdbId, platformId)} onRemove={removeGame} onPlaying={setPlaying} onRatingChange={() => void refreshGames().catch(() => {})}/>}
      <footer className="page-footer"><span>Game information and covers powered by IGDB.</span><span>YOUR LIBRARY · {games.length} COPIES</span></footer>
    </div>
  </main>;
}

// Other players' libraries have no toggles, so their cards spell out the completed line above the score.
export function GameProgress({ game }: { game: Pick<SavedGame, "completedAt" | "score"> }) {
  return <>
    {game.completedAt ? <span className="game-owned-label playing-label"><CircleCheck size={13} aria-hidden="true"/>Completed</span> : null}
    {game.score ? <ScoreStars score={game.score} className="game-card-score"/> : null}
  </>;
}

export function LibrarySortSelect({ value, onChange }: { value: LibrarySort; onChange: (sort: LibrarySort) => void }) {
  return <label className="library-sort"><span>Sort</span><select value={value} onChange={(event) => onChange(event.target.value as LibrarySort)}>
    {librarySorts.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select></label>;
}

function GameCover({ game }: { game: SavedGame }) {
  return <div className="game-cover">{game.coverUrl ? <img src={game.coverUrl} alt={`${game.name} cover`} loading="lazy"/> : <div className="cover-fallback"><Gamepad2 size={29}/><span>{game.name.slice(0, 1)}</span></div>}</div>;
}
