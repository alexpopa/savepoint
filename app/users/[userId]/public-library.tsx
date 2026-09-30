"use client";

import { useEffect, useRef, useState } from "react";
import { Gamepad2, Search } from "lucide-react";
import { GameChallenges } from "../../challenges";
import GameDetailsDialog from "../../game-details-dialog";
import PlatformFilter, { type Platform } from "../../platform-filter";
import type { Challenge } from "../../../lib/challenges";
import type { CatalogGame, SavedGame } from "../../../lib/game-types";
import { filterLibraryGames, paginateLibraryGames } from "../../../lib/library-view";

type Props = {
  games: PublicGame[];
  recipientId: string;
  viewerId: string;
  challengeRows: Challenge[];
  canCreateChallenges: boolean;
  canManageChallenges?: boolean;
  signedIn: boolean;
  loginPath: string;
};

type PublicGame = SavedGame & { catalogIgdbId?: number };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}

export default function PublicLibrary({ games, recipientId, viewerId, challengeRows, canCreateChallenges, canManageChallenges = false, signedIn, loginPath }: Props) {
  const [selected, setSelected] = useState<PublicGame | null>(null);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  const [coverOverrides, setCoverOverrides] = useState<Record<number, string | null>>({});
  const [catalogIdOverrides, setCatalogIdOverrides] = useState<Record<number, number>>({});
  const [unavailableCovers, setUnavailableCovers] = useState<Record<number, true>>({});
  const [query, setQuery] = useState("");
  const [platformIds, setPlatformIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const pageStatus = useRef<HTMLParagraphElement>(null);
  const attemptedCoverRefreshes = useRef(new Set<number>());
  const pendingCoverRefreshes = useRef(new Set<number>());

  useEffect(() => {
    if (signedIn) api<{ games: SavedGame[] }>("/api/library").then(({ games }) => setSaved(games)).catch(() => {});
  }, [signedIn]);

  async function refreshSaved() {
    const data = await api<{ games: SavedGame[] }>("/api/library");
    setSaved(data.games);
  }

  async function addGame(igdbId: number, platformId: number) {
    await api("/api/library", { method: "POST", body: JSON.stringify({ igdbId, platformId }) });
    await refreshSaved();
  }

  async function removeGame(id: number) {
    await api(`/api/library/${id}`, { method: "DELETE" });
    await refreshSaved();
  }

  async function setPlaying(id: number, playing: boolean) {
    await api(`/api/library/${id}/playing`, { method: playing ? "PUT" : "DELETE" });
    await refreshSaved();
  }

  async function recoverCover(igdbId: number, failedCoverUrl: string) {
    if (!signedIn) {
      setUnavailableCovers((current) => ({ ...current, [igdbId]: true }));
      return;
    }
    if (pendingCoverRefreshes.current.has(igdbId)) return;
    if (attemptedCoverRefreshes.current.has(igdbId)) {
      setUnavailableCovers((current) => ({ ...current, [igdbId]: true }));
      return;
    }

    attemptedCoverRefreshes.current.add(igdbId);
    pendingCoverRefreshes.current.add(igdbId);
    setUnavailableCovers((current) => ({ ...current, [igdbId]: true }));
    try {
      const result = await api<{ coverUrl: string | null; catalogIgdbId: number }>(`/api/igdb/games/${igdbId}/cover`, {
        method: "POST",
        body: JSON.stringify({ failedCoverUrl }),
      });
      if (result.catalogIgdbId !== igdbId) setCatalogIdOverrides((current) => ({ ...current, [igdbId]: result.catalogIgdbId }));
      if (result.coverUrl && result.coverUrl !== failedCoverUrl) {
        setCoverOverrides((current) => ({ ...current, [igdbId]: result.coverUrl }));
        setUnavailableCovers((current) => {
          const next = { ...current };
          delete next[igdbId];
          return next;
        });
      } else {
        setUnavailableCovers((current) => ({ ...current, [igdbId]: true }));
      }
    } catch {
      setUnavailableCovers((current) => ({ ...current, [igdbId]: true }));
    } finally {
      pendingCoverRefreshes.current.delete(igdbId);
    }
  }

  const selectedCatalogId = selected ? catalogIdOverrides[selected.igdbId] ?? selected.catalogIgdbId ?? selected.igdbId : undefined;
  const selectedCopies = selected ? saved.filter((game) => game.igdbId === selected.igdbId || game.igdbId === selectedCatalogId) : [];
  const platforms: Platform[] = [...new Map(games.map((game) => [game.platformId, { id: game.platformId, name: game.platformName || "Platform not set" }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const matching = filterLibraryGames(games, query, platformIds);
  const { items: visible, page: currentPage, pageCount, first, last } = paginateLibraryGames(matching, page);
  const filtered = Boolean(query.trim() || platformIds.length);

  function changePage(next: number) {
    setPage(next);
    requestAnimationFrame(() => {
      pageStatus.current?.focus({ preventScroll: true });
      pageStatus.current?.scrollIntoView({ block: "start" });
    });
  }

  return <>
    <div className="library-tools">
      <label className="library-search"><span>Search their games</span><span className="library-search-field"><Search size={17} aria-hidden="true"/><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search titles" maxLength={100} autoComplete="off" spellCheck={false}/></span></label>
      <PlatformFilter platforms={platforms} selected={platformIds} onChange={(ids) => { setPlatformIds(ids); setPage(1); }} className="is-end"/>
    </div>
    <p ref={pageStatus} className="library-results" role="status" tabIndex={-1}>{matching.length ? `Showing ${first}–${last} of ${matching.length} ${filtered ? "matching " : ""}${matching.length === 1 ? "copy" : "copies"}` : "No matching copies"}</p>
    {matching.length === 0 ? <div className="empty-state"><div className="empty-icon"><Search size={27}/></div><h2>No games match</h2><p>Try another title or platform.</p><button type="button" className="library-clear" onClick={() => { setQuery(""); setPlatformIds([]); setPage(1); }}>Clear filters</button></div> : <div className="game-grid library-grid">{visible.map((game) => {
      const openGame = () => setSelected(game);
      const coverUrl = Object.prototype.hasOwnProperty.call(coverOverrides, game.igdbId) ? coverOverrides[game.igdbId] : game.coverUrl;
      return <article className="game-card challenge-game-card" key={game.id}>
        <button type="button" className="game-card-open" aria-label={`View details and platform options for ${game.name}`} onClick={openGame}>
          <div className="game-cover">{coverUrl && !unavailableCovers[game.igdbId] ? <img src={coverUrl} alt={`${game.name} cover`} loading="lazy" onError={() => void recoverCover(game.igdbId, coverUrl)}/> : <div className="cover-fallback"><Gamepad2 size={29}/><span>{game.name.slice(0, 1)}</span></div>}</div>
          <div className="game-info"><h3>{game.name}</h3><p>{game.releaseYear || "Year unknown"}</p><span className="game-platform-label"><Gamepad2 size={14}/>{game.platformName || "Platform not set"}</span></div>
        </button>
        <GameChallenges game={game} recipientId={recipientId} viewerId={viewerId} rows={challengeRows} canCreate={canCreateChallenges} canManage={canManageChallenges}/>
      </article>;
    })}</div>}
    {pageCount > 1 && <nav className="library-pagination" aria-label="Library pages"><span>Page {currentPage} of {pageCount}</span><div><button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>Next</button></div></nav>}
    {selected && <GameDetailsDialog key={selectedCatalogId} game={{ ...selected, igdbId: selectedCatalogId!, platformOptions: [] } satisfies CatalogGame} saved={selectedCopies} signedIn={signedIn} loginPath={loginPath} onClose={() => setSelected(null)} onAdd={(platformId) => addGame(selectedCatalogId!, platformId)} onRemove={removeGame} onPlaying={setPlaying}/>}
  </>;
}
