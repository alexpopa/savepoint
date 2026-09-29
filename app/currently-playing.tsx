"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Gamepad2, Pencil, Play, X } from "lucide-react";
import type { PlayingGame } from "../lib/currently-playing";
import type { CatalogGame, SavedGame } from "../lib/game-types";
import GameDetailsDialog from "./game-details-dialog";

const shown = 3;

export async function playingRequest(id: number, playing: boolean): Promise<PlayingGame[]> {
  const response = await fetch(`/api/library/${id}/playing`, { method: playing ? "PUT" : "DELETE", headers: { "content-type": "application/json" } });
  const data = await response.json() as { playing: PlayingGame[]; error?: string };
  if (!response.ok) throw new Error(data.error || "Could not update currently playing.");
  return data.playing;
}

// Newest first, with no ordering of its own. Edit only removes, matching the Top 10's controls.
export default function CurrentlyPlaying({ initialGames, canManage, isOwner = false }: { initialGames: PlayingGame[]; canManage: boolean; isOwner?: boolean }) {
  const [games, setGames] = useState(initialGames);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CatalogGame | null>(null);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  async function remove(game: PlayingGame) {
    setBusy(true); setError("");
    try {
      const next = await playingRequest(game.id, false);
      setGames(next); setStatus(`${game.name} removed from Currently playing.`);
      if (!next.length) setEditing(false);
    }
    catch (error) { setError(error instanceof Error ? error.message : "Could not update currently playing."); }
    finally { setBusy(false); }
  }
  async function libraryRequest(init?: RequestInit, id?: number) {
    const response = await fetch(`/api/library${id ? `/${id}` : ""}`, { ...init, headers: { "content-type": "application/json" } });
    const data = await response.json() as { games: SavedGame[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load your library.");
    if (!init) setSaved(data.games);
  }
  async function open(game: PlayingGame) {
    setError("");
    try {
      await libraryRequest();
      setSelected({ ...game, platforms: [], platformOptions: [] });
    } catch (error) { setError(error instanceof Error ? error.message : "Could not open this game."); }
  }
  if (!games.length && !isOwner) return null;
  const visible = expanded ? games : games.slice(0, shown);
  return <section className="profile-section" aria-labelledby="playing-title">
    <div className="profile-section-head">
      <h2 id="playing-title" className="profile-label"><Play size={15} aria-hidden="true"/>Currently playing</h2>
      {canManage && games.length > 0 && <button type="button" className="profile-tool" aria-pressed={editing} onClick={() => { setEditing(!editing); setStatus(""); }}>
        {editing ? <Check size={15} aria-hidden="true"/> : <Pencil size={15} aria-hidden="true"/>}{editing ? "Done" : "Edit"}
      </button>}
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {games.length ? <>
      <ul id="playing-list" className="playing-list">
        {visible.map((game) => <li key={game.id} className="playing-slot">
          <button type="button" className="playing-open" onClick={() => void open(game)}>
            <PlayingCover game={game}/>
            <span className="playing-name">{game.name}</span>
            <span className="playing-platform">{game.platformName || "Platform not set"}</span>
          </button>
          {editing && <button type="button" className="shelf-remove playing-remove" aria-label={`Remove ${game.name} on ${game.platformName || "an unspecified platform"} from Currently playing`} title="Remove from Currently playing" disabled={busy} onClick={() => void remove(game)}><X size={14} aria-hidden="true"/></button>}
        </li>)}
      </ul>
      {games.length > shown && <button type="button" className="profile-tool playing-more" aria-expanded={expanded} aria-controls="playing-list" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronUp size={15} aria-hidden="true"/> : <ChevronDown size={15} aria-hidden="true"/>}{expanded ? "Show fewer" : `Show all (${games.length})`}
      </button>}
    </> : <div className="profile-screen-empty"><Gamepad2 size={22} aria-hidden="true"/><p>Nothing playing right now</p><a className="playing-empty-link" href="/library">Mark a game in your library</a></div>}
    <p className="shelf-status" role="status">{status}</p>
    {selected && <GameDetailsDialog key={selected.igdbId} game={selected} saved={saved.filter((game) => game.igdbId === selected.igdbId)} signedIn onClose={() => setSelected(null)}
      onAdd={async (platformId) => { await libraryRequest({ method: "POST", body: JSON.stringify({ igdbId: selected.igdbId, platformId }) }); await libraryRequest(); }}
      onRemove={async (id) => { await libraryRequest({ method: "DELETE" }, id); await libraryRequest(); if (isOwner) setGames((current) => current.filter((game) => game.id !== id)); }}
      onPlaying={async (id, playing) => { const next = await playingRequest(id, playing); if (isOwner) setGames(next); await libraryRequest(); }}/>}
  </section>;
}

function PlayingCover({ game }: { game: PlayingGame }) {
  const [failed, setFailed] = useState(false);
  return <span className="playing-cover">{game.coverUrl && !failed
    ? <img src={game.coverUrl.replace("/t_cover_big/", "/t_cover_big_2x/")} alt="" loading="lazy" onError={() => setFailed(true)}/>
    : <span className="cover-fallback"><Gamepad2 size={28} aria-hidden="true"/><span>{game.name.slice(0, 1)}</span></span>}</span>;
}
