"use client";

import { useState } from "react";
import { Check, Gamepad2, Pencil, Plus, X } from "lucide-react";
import { favoriteLimit } from "../lib/game-favorite-queries";
import type { GameFavorite } from "../lib/game-favorites";
import type { CatalogGame, SavedGame } from "../lib/game-types";
import GameDetailsDialog from "./game-details-dialog";
import { favoriteRequest } from "./game-favorite-button";
import { playingRequest } from "./currently-playing";
import GamePicker, { libraryParams, pickerRequest, type PickerSource } from "./game-picker";
import type { Platform } from "./platform-filter";
import type { LibraryGame } from "../lib/library-copies-query";

const shelves = [[0, 5], [5, favoriteLimit]];

// Favorites can be any IGDB game. The picker opens on the player's own library, one row per game,
// and searches IGDB once there are two characters (IGDB's minimum). IGDB returns a single page.
// Both use IGDB platform IDs, so one platform list, fetched once per page view, filters either.
let igdbPlatforms: Promise<Platform[]> | null = null;
const favoriteSource: PickerSource = {
  async load({ query, platformIds, cursor }, signal) {
    igdbPlatforms ??= pickerRequest<{ platforms: Platform[] }>("/api/igdb/platforms", undefined, "IGDB platforms are unavailable.")
      .then((data) => data.platforms).catch(() => { igdbPlatforms = null; return []; });
    if (query.length < 2) {
      const params = libraryParams(query, platformIds, cursor);
      params.set("group", "game");
      const [platforms, page] = await Promise.all([igdbPlatforms, pickerRequest<{ items: LibraryGame[]; next: string | null }>(`/api/library/copies?${params}`, signal, "Could not load your library.")]);
      return { next: page.next, platforms, heading: "Your library", items: page.items.map((game) => ({ id: game.igdbId, name: game.name, coverUrl: game.coverUrl, detail: game.platformNames })) };
    }
    const params = new URLSearchParams({ q: query });
    platformIds.forEach((id) => params.append("platform", String(id)));
    const [platforms, { games }] = await Promise.all([igdbPlatforms, pickerRequest<{ games: CatalogGame[] }>(`/api/igdb/search?${params}`, signal, "IGDB search failed.")]);
    return { next: null, platforms, heading: "All games on IGDB", items: games.map((game) => ({ id: game.igdbId, name: game.name, coverUrl: game.coverUrl,
      detail: [game.releaseYear, game.platforms.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "Release year unknown" })) };
  },
};

// Covers stand on two shelves of five. In Edit, a cover is picked up and set down
// by click, keyboard, or drag, so reordering never depends on a pointer.
export default function FavoriteGames({ initialFavorites, canManage, isOwner = false }: { initialFavorites: GameFavorite[]; canManage: boolean; isOwner?: boolean }) {
  const [favorites, setFavorites] = useState(initialFavorites);
  const [arranging, setArranging] = useState(false);
  const [held, setHeld] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CatalogGame | null>(null);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  const [picking, setPicking] = useState(false);
  async function place(id: number, position: number) {
    const from = favorites.findIndex((game) => game.id === id);
    setHeld(null); setOver(null);
    if (from < 0 || from === position - 1) return;
    const previous = favorites, next = [...favorites];
    const [game] = next.splice(from, 1);
    next.splice(position - 1, 0, game);
    setFavorites(next); setBusy(true); setError(""); setStatus(`${game.name} moved to ${position}.`);
    try { setFavorites(await favoriteRequest(`/api/game-favorites/${id}`, { method: "PATCH", body: JSON.stringify({ position }) })); }
    catch (error) { setFavorites(previous); setError(error instanceof Error ? error.message : "Could not update favorite games."); }
    finally { setBusy(false); }
  }
  async function remove(game: GameFavorite) {
    setBusy(true); setError(""); setHeld(null);
    try {
      const next = await favoriteRequest(`/api/game-favorites/${game.id}`, { method: "DELETE" });
      setFavorites(next); setStatus(`${game.name} removed from Top 10.`);
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
  function choose(game: GameFavorite, index: number) {
    if (!arranging) return void open(game);
    if (busy) return;
    if (held === null) { setHeld(game.id); setStatus(`${game.name} picked up. Choose its new spot, or press Escape.`); }
    else if (held === game.id) { setHeld(null); setStatus(`${game.name} put back.`); }
    else void place(held, index + 1);
  }
  function toggleArranging() {
    setArranging(!arranging); setHeld(null); setOver(null);
    setStatus(arranging ? "" : "Select a cover, then select its new spot.");
  }
  const heldIndex = favorites.findIndex((game) => game.id === held);
  const heldGame = favorites[heldIndex];
  const litIndex = favorites.findIndex((game) => game.id === lit);
  const canAdd = isOwner && !arranging && favorites.length < favoriteLimit;
  const caption = arranging
    ? heldGame ? `Moving ${heldGame.name}` : "Select a cover, then its new spot"
    : litIndex >= 0 ? favorites[litIndex] : null;
  return <section className="profile-section" aria-labelledby="top-ten-title">
    <div className="profile-section-head">
      <h2 id="top-ten-title" className="profile-label"><span className="rgb-bar" aria-hidden="true"/>Top 10</h2>
      {canManage && favorites.length > 0 && <button type="button" className="profile-tool" aria-pressed={arranging} onClick={toggleArranging}>
        {arranging ? <Check size={15} aria-hidden="true"/> : <Pencil size={15} aria-hidden="true"/>}{arranging ? "Done" : "Edit"}
      </button>}
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {favorites.length || isOwner ? <div className={`bookshelf${arranging ? " is-arranging" : ""}${held !== null ? " is-holding" : ""}`} onKeyDown={(event) => { if (event.key === "Escape" && held !== null) { setHeld(null); setStatus("Move cancelled."); } }}>
      {shelves.filter(([start]) => start < favorites.length + (canAdd ? 1 : 0)).map(([start, end]) => <ol key={start} className="shelf" start={start + 1}>
        {favorites.slice(start, end).map((game, offset) => {
          const index = start + offset;
          const target = over === index && held !== null && held !== game.id ? (heldIndex < index ? " is-target-after" : " is-target-before") : "";
          return <li key={game.id} className={`shelf-slot${held === game.id ? " is-held" : ""}${target}`}
            onDragOver={(event) => { if (held === null) return; event.preventDefault(); setOver(index); }}
            onDragLeave={() => setOver((current) => current === index ? null : current)}
            onDrop={(event) => { event.preventDefault(); if (held !== null) void place(held, index + 1); }}>
            <button type="button" className="shelf-book" draggable={arranging && !busy}
              aria-label={arranging
                ? held === null ? `${index + 1}. ${game.name}. Pick up to move` : held === game.id ? `${index + 1}. ${game.name}. Put back` : `Move ${heldGame?.name} to ${index + 1}, where ${game.name} is`
                : `${index + 1}. ${game.name}${game.releaseYear ? `, ${game.releaseYear}` : ""}. View details`}
              aria-pressed={arranging ? held === game.id : undefined}
              onMouseEnter={() => setLit(game.id)} onMouseLeave={() => setLit(null)} onFocus={() => setLit(game.id)} onBlur={() => setLit(null)}
              onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(game.id)); setHeld(game.id); }}
              onDragEnd={() => { setHeld(null); setOver(null); }}
              onClick={() => choose(game, index)}>
              <BookCover game={game}/>
            </button>
            {arranging && <button type="button" className="shelf-remove" aria-label={`Remove ${game.name} from Top 10`} title="Remove from Top 10" disabled={busy} onClick={() => void remove(game)}><X size={14} aria-hidden="true"/></button>}
          </li>;
        })}
        {canAdd && favorites.length >= start && favorites.length < end && <li className="shelf-slot">
          <button type="button" className="shelf-add" aria-haspopup="dialog" aria-label="Add a game to your Top 10" title="Add a game" onClick={() => setPicking(true)}><Plus size={20} aria-hidden="true"/></button>
        </li>}
      </ol>)}
      <p className="shelf-caption" aria-hidden="true">
        {typeof caption === "string" ? <span>{caption}</span>
          : caption ? <><b>{(litIndex + 1).toString().padStart(2, "0")}</b><span>{caption.name}</span>{caption.releaseYear && <small>{caption.releaseYear}</small>}</> : null}
      </p>
      <p className="shelf-status" role="status">{status}</p>
    </div> : <div className="profile-screen-empty"><Gamepad2 size={22} aria-hidden="true"/><p>No games picked yet</p></div>}
    {picking && <GamePicker title="Add to your Top 10" searchLabel="Search games" source={favoriteSource} selectedLabel="In Top 10"
      isSelected={(item) => favorites.some((game) => game.igdbId === item.id)} onClose={() => setPicking(false)}
      emptyText="Your library is empty. Type a game's name to search all games."
      fullText={favorites.length >= favoriteLimit ? `Your Top 10 is full. Remove a game to add another.` : undefined}
      onToggle={async (item, add) => {
        const favorite = favorites.find((game) => game.igdbId === item.id);
        setFavorites(await favoriteRequest(add ? "/api/game-favorites" : `/api/game-favorites/${favorite?.id}`, add ? { method: "POST", body: JSON.stringify({ igdbId: item.id }) } : { method: "DELETE" }));
        setStatus(`${item.name} ${add ? "added to" : "removed from"} Top 10.`);
      }}/>}
    {selected && <GameDetailsDialog key={selected.igdbId} game={selected} saved={saved.filter((game) => game.igdbId === selected.igdbId)} signedIn onClose={() => setSelected(null)} onFavoritesChange={isOwner ? setFavorites : undefined} onAdd={async (platformId) => { await libraryRequest({ method: "POST", body: JSON.stringify({ igdbId: selected.igdbId, platformId }) }); await libraryRequest(); }} onRemove={async (id) => { await libraryRequest({ method: "DELETE" }, id); await libraryRequest(); }} onPlaying={async (id, playing) => { await playingRequest(id, playing); await libraryRequest(); }}/>}
  </section>;
}

function BookCover({ game }: { game: GameFavorite }) {
  const [failed, setFailed] = useState(false);
  return game.coverUrl && !failed
    ? <img src={game.coverUrl} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)}/>
    : <span className="cover-fallback"><Gamepad2 size={24}/><span>{game.name.slice(0, 1)}</span></span>;
}
