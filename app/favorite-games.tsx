"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Gamepad2, Star } from "lucide-react";
import type { GameFavorite } from "../lib/game-favorites";
import type { CatalogGame, SavedGame } from "../lib/game-types";
import GameDetailsDialog from "./game-details-dialog";
import { favoriteRequest } from "./game-favorite-button";

export default function FavoriteGames({ initialFavorites, canManage, isOwner = false }: { initialFavorites: GameFavorite[]; canManage: boolean; isOwner?: boolean }) {
  const [favorites, setFavorites] = useState(initialFavorites);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CatalogGame | null>(null);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  async function act(id: number, action: "move_up" | "move_down" | "remove") {
    setBusy(true); setError("");
    try { setFavorites(await favoriteRequest(`/api/game-favorites/${id}`, { method: action === "remove" ? "DELETE" : "PATCH", body: action === "remove" ? undefined : JSON.stringify({ action }) })); }
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
  return <section className="favorite-games" aria-labelledby="favorite-games-title">
    <div className="section-title"><div><p className="eyebrow"><Star size={14} aria-hidden="true"/> FAVORITES</p><h2 id="favorite-games-title">Favorite games <span className="small-count">{favorites.length} / 9</span></h2></div>{isOwner && <a className="text-button" href="/search">Find games</a>}</div>
    {isOwner && <p className="subcopy favorite-games-help">Star a game in its details. Use the arrows to arrange your favorites.</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {favorites.length ? <ol className="game-grid favorite-games-grid">{favorites.map((game, index) => <li className="game-card favorite-game-card" key={game.id}>
      <div className="favorite-game-tools"><span className="favorite-game-rank">#{index + 1}</span>{canManage && <div className="challenge-rank-tools">
        <button type="button" className="challenge-icon-button" aria-label={`Move ${game.name} up`} title="Move up" disabled={busy || index === 0} onClick={() => void act(game.id, "move_up")}><ArrowUp size={17}/></button>
        <button type="button" className="challenge-icon-button" aria-label={`Move ${game.name} down`} title="Move down" disabled={busy || index === favorites.length - 1} onClick={() => void act(game.id, "move_down")}><ArrowDown size={17}/></button>
        <button type="button" className="challenge-icon-button" aria-label={`Remove ${game.name} from favorite games`} title="Unfavorite" disabled={busy} onClick={() => void act(game.id, "remove")}><Star size={17} fill="currentColor"/></button>
      </div>}</div>
      <button type="button" className="game-card-open" aria-label={`View ${game.name} details`} onClick={() => void open(game)}><FavoriteCover game={game}/><div className="game-info"><h3>{game.name}</h3><p>{game.releaseYear || "Year unknown"}</p></div></button>
    </li>)}</ol> : <p className="challenge-section-empty">{isOwner ? "No favorite games yet. Find a game and select Favorite game in its details." : "No favorite games yet."}</p>}
    {selected && <GameDetailsDialog key={selected.igdbId} game={selected} saved={saved.filter((game) => game.igdbId === selected.igdbId)} signedIn onClose={() => setSelected(null)} onFavoritesChange={isOwner ? setFavorites : undefined} onAdd={async (platformId) => { await libraryRequest({ method: "POST", body: JSON.stringify({ igdbId: selected.igdbId, platformId }) }); await libraryRequest(); }} onRemove={async (id) => { await libraryRequest({ method: "DELETE" }, id); await libraryRequest(); }}/>}
  </section>;
}

function FavoriteCover({ game }: { game: GameFavorite }) {
  const [failed, setFailed] = useState(false);
  return <div className="game-cover">{game.coverUrl && !failed ? <img src={game.coverUrl} alt="" loading="lazy" onError={() => setFailed(true)}/> : <div className="cover-fallback"><Gamepad2 size={29}/></div>}</div>;
}
