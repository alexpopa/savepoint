"use client";

import { useEffect, useRef, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { GameChallenges } from "../../challenges";
import GameDetailsDialog from "../../game-details-dialog";
import type { Challenge } from "../../../lib/challenges";
import type { CatalogGame, SavedGame } from "../../../lib/game-types";

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

  return <>
    <div className="game-grid library-grid">{games.map((game) => {
      const openGame = () => setSelected(game);
      const coverUrl = Object.prototype.hasOwnProperty.call(coverOverrides, game.igdbId) ? coverOverrides[game.igdbId] : game.coverUrl;
      return <article className="game-card challenge-game-card" key={game.id}>
        <button type="button" className="game-card-open" aria-label={`View details and platform options for ${game.name}`} onClick={openGame}>
          <div className="game-cover">{coverUrl && !unavailableCovers[game.igdbId] ? <img src={coverUrl} alt={`${game.name} cover`} loading="lazy" onError={() => void recoverCover(game.igdbId, coverUrl)}/> : <div className="cover-fallback"><Gamepad2 size={29}/><span>{game.name.slice(0, 1)}</span></div>}</div>
          <div className="game-info"><h3>{game.name}</h3><p>{game.releaseYear || "Year unknown"}</p><span className="game-platform-label"><Gamepad2 size={14}/>{game.platformName || "Platform not set"}</span></div>
        </button>
        <GameChallenges game={game} recipientId={recipientId} viewerId={viewerId} rows={challengeRows} canCreate={canCreateChallenges} canManage={canManageChallenges}/>
      </article>;
    })}</div>
    {selected && <GameDetailsDialog key={selectedCatalogId} game={{ ...selected, igdbId: selectedCatalogId!, platformOptions: [] } satisfies CatalogGame} saved={selectedCopies} signedIn={signedIn} loginPath={loginPath} onClose={() => setSelected(null)} onAdd={(platformId) => addGame(selectedCatalogId!, platformId)} onRemove={removeGame} onPlaying={setPlaying}/>}
  </>;
}
