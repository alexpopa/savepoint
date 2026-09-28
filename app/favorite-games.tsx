"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Gamepad2, Pencil, Plus, Star } from "lucide-react";
import type { GameFavorite } from "../lib/game-favorites";
import type { CatalogGame, SavedGame } from "../lib/game-types";
import GameDetailsDialog from "./game-details-dialog";
import { favoriteRequest } from "./game-favorite-button";

const slots = 9;

// The cover wall is a pointer shortcut; the numbered list is the keyboard and screen reader path.
export default function FavoriteGames({ initialFavorites, canManage, isOwner = false }: { initialFavorites: GameFavorite[]; canManage: boolean; isOwner?: boolean }) {
  const [favorites, setFavorites] = useState(initialFavorites);
  const [arranging, setArranging] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CatalogGame | null>(null);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  async function act(id: number, action: "move_up" | "move_down" | "remove") {
    setBusy(true); setError("");
    try {
      const next = await favoriteRequest(`/api/game-favorites/${id}`, { method: action === "remove" ? "DELETE" : "PATCH", body: action === "remove" ? undefined : JSON.stringify({ action }) });
      setFavorites(next);
      if (!next.length) setArranging(false);
    }
    catch (error) { setError(error instanceof Error ? error.message : "Could not update favorite games."); }
    finally { setBusy(false); }
  }
  async function libraryRequest(init?: RequestInit, id?: number) {
    const response = await fetch(`/api/library${id ? `/${id}` : ""}`, { ...init, headers: { "content-type": "application/json" } });
    const data = await response.json() as { games: SavedGame[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load your library.");
    if (!init) setSaved(data.games);
  }
  async function open(game: GameFavorite) {
    setError("");
    try {
      await libraryRequest();
      setSelected({ ...game, platforms: [], platformOptions: [] });
    } catch (error) { setError(error instanceof Error ? error.message : "Could not open this game."); }
  }
  const canAdd = isOwner && favorites.length < slots;
  return <section className="profile-section top-nine" aria-labelledby="top-nine-title">
    <div className="profile-section-head">
      <h2 id="top-nine-title" className="profile-label"><span className="rgb-bar" aria-hidden="true"/>Top 9</h2>
      {canManage && favorites.length > 0 && <button type="button" className="profile-tool" aria-pressed={arranging} onClick={() => setArranging(!arranging)}>
        {arranging ? <Check size={15} aria-hidden="true"/> : <Pencil size={15} aria-hidden="true"/>}{arranging ? "Done" : "Edit"}
      </button>}
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {favorites.length || isOwner ? <div className={`top-nine-screen${arranging ? " is-arranging" : ""}`} onMouseLeave={() => setLit(null)}>
      <ol className="top-nine-wall" aria-hidden="true">
        {Array.from({ length: slots }, (_, index) => {
          const game = favorites[index];
          if (game) return <li key={game.id} className={lit === game.id ? "is-lit" : undefined} onMouseEnter={() => setLit(game.id)}>
            <button type="button" className="top-nine-tile" tabIndex={-1} onClick={() => void open(game)}><WallCover game={game}/></button>
          </li>;
          return <li key={`slot-${index}`}>{canAdd && index === favorites.length
            ? <a className="top-nine-add" href="/search" tabIndex={-1}><Plus size={22}/></a>
            : <span className="top-nine-blank"/>}</li>;
        })}
      </ol>
      <ol className="top-nine-list">
        {favorites.map((game, index) => <li key={game.id} className={`top-nine-row${lit === game.id ? " is-lit" : ""}`} onMouseEnter={() => setLit(game.id)}>
          <span className="top-nine-rank" aria-hidden="true">{(index + 1).toString().padStart(2, "0")}</span>
          <button type="button" className="top-nine-name" aria-label={`${index + 1}. ${game.name}${game.releaseYear ? `, ${game.releaseYear}` : ""}. View details`} onFocus={() => setLit(game.id)} onBlur={() => setLit(null)} onClick={() => void open(game)}>
            <span>{game.name}</span><small>{game.releaseYear || "Year unknown"}</small>
          </button>
          {arranging && <div className="top-nine-tools">
            <button type="button" className="challenge-icon-button" aria-label={`Move ${game.name} up`} title="Move up" disabled={busy || index === 0} onClick={() => void act(game.id, "move_up")}><ArrowUp size={17}/></button>
            <button type="button" className="challenge-icon-button" aria-label={`Move ${game.name} down`} title="Move down" disabled={busy || index === favorites.length - 1} onClick={() => void act(game.id, "move_down")}><ArrowDown size={17}/></button>
            <button type="button" className="challenge-icon-button" aria-label={`Remove ${game.name} from top 9`} title="Remove from top 9" disabled={busy} onClick={() => void act(game.id, "remove")}><Star size={17} fill="currentColor"/></button>
          </div>}
        </li>)}
        {canAdd && !arranging && <li className="top-nine-row is-add">
          <span className="top-nine-rank" aria-hidden="true">{(favorites.length + 1).toString().padStart(2, "0")}</span>
          <a className="top-nine-name" href="/search"><span><Plus size={15} aria-hidden="true"/> Add a game</span></a>
        </li>}
      </ol>
    </div> : <div className="profile-screen-empty"><Gamepad2 size={22} aria-hidden="true"/><p>No games picked yet</p></div>}
    {selected && <GameDetailsDialog key={selected.igdbId} game={selected} saved={saved.filter((game) => game.igdbId === selected.igdbId)} signedIn onClose={() => setSelected(null)} onFavoritesChange={isOwner ? setFavorites : undefined} onAdd={async (platformId) => { await libraryRequest({ method: "POST", body: JSON.stringify({ igdbId: selected.igdbId, platformId }) }); await libraryRequest(); }} onRemove={async (id) => { await libraryRequest({ method: "DELETE" }, id); await libraryRequest(); }}/>}
  </section>;
}

function WallCover({ game }: { game: GameFavorite }) {
  const [failed, setFailed] = useState(false);
  return game.coverUrl && !failed
    ? <img src={game.coverUrl} alt="" loading="lazy" onError={() => setFailed(true)}/>
    : <span className="cover-fallback"><Gamepad2 size={29}/><span>{game.name.slice(0, 1)}</span></span>;
}
