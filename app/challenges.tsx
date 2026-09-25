"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Flag, Gamepad2, Plus, Star, X } from "lucide-react";
import type { Challenge } from "../lib/challenges";

type Game = { igdbId: number; name: string };

function completed(row: Challenge) { return row.creatorConfirmed && row.recipientConfirmed && !row.declined; }

async function patch(id: number, action: string) {
  const response = await fetch(`/api/challenges/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Could not update the challenge.");
  window.location.reload();
}

function ChallengeCard({ row, viewerId, ownerControls = false, moveUp = false, moveDown = false }: { row: Challenge; viewerId: string; ownerControls?: boolean; moveUp?: boolean; moveDown?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  const isRecipient = viewerId === row.recipientId;
  const isCreator = viewerId === row.creatorId;
  const myConfirmed = isRecipient ? row.recipientConfirmed : row.creatorConfirmed;
  const isComplete = completed(row);
  const cardStatus = row.declined ? "Declined" : isComplete ? "" : "Pending";
  async function act(action: string) {
    setBusy(true); setError("");
    try { await patch(row.id, action); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the challenge."); setBusy(false); }
  }
  return <article className={`challenge-card ${row.declined ? "is-declined" : completed(row) ? "is-complete" : "is-pending"} ${row.isFavorite ? "is-favorite" : ""}`}>
    {(cardStatus || row.isFavorite && !row.declined) && <div className="challenge-card-top">{cardStatus && <span className="challenge-status"><Flag size={15} aria-hidden="true"/> {cardStatus}</span>}{row.isFavorite && !row.declined && <span className="challenge-favorite"><Star size={14} fill="currentColor" aria-hidden="true"/> Favorite</span>}</div>}
    <div className="challenge-card-main">
      <div className="challenge-game-cover">
        {row.gameCoverUrl && !coverUnavailable
          ? <img src={row.gameCoverUrl} alt={`${row.gameName} cover`} loading="lazy" onError={() => setCoverUnavailable(true)}/>
          : <div className="cover-fallback challenge-cover-fallback"><Gamepad2 size={25} aria-hidden="true"/><span>{row.gameName.slice(0, 1)}</span></div>}
      </div>
      <div className="challenge-card-content">
        <p className="challenge-game-title">{row.gameName}</p>
        <h3>{row.title}</h3>
        <p className="challenge-byline">{isCreator ? "For" : "From"} <a className="inline-link" href={isCreator ? row.recipientProfilePath : row.creatorProfilePath}>{isCreator ? row.recipientName : row.creatorName}</a></p>
      </div>
    </div>
    {!row.declined && (isRecipient || isCreator) && <div className="challenge-actions">
      <button type="button" disabled={busy} onClick={() => void act(myConfirmed ? "unconfirm" : "confirm")}>{myConfirmed ? "Undo my confirmation" : "Mark complete"}</button>
      {isRecipient && <button type="button" className="subtle-danger" disabled={busy} onClick={() => void act("decline")}>{completed(row) ? "Remove" : "Decline"}</button>}
      {isRecipient && ownerControls && <>
        <button type="button" disabled={busy} aria-label={row.isFavorite ? `Remove ${row.title} from favorites` : `Favorite ${row.title}`} onClick={() => void act(row.isFavorite ? "unfavorite" : "favorite")}><Star size={15} fill={row.isFavorite ? "currentColor" : "none"}/> {row.isFavorite ? "Unfavorite" : "Favorite"}</button>
        <button type="button" disabled={busy || !moveUp} aria-label={`Move ${row.title} up`} onClick={() => void act("move_up")}><ArrowUp size={16}/></button>
        <button type="button" disabled={busy || !moveDown} aria-label={`Move ${row.title} down`} onClick={() => void act("move_down")}><ArrowDown size={16}/></button>
      </>}
    </div>}
    {error && <p className="challenge-error" role="alert">{error}</p>}
  </article>;
}

export function GameChallenges({ game, recipientId, viewerId, rows, canCreate = false }: { game: Game; recipientId: string; viewerId: string; rows: Challenge[]; canCreate?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const visible = rows.filter((row) => row.igdbId === game.igdbId && !row.declined);
  return <div className="game-challenges">
    <div className="game-challenge-actions"><button type="button" className="challenge-link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>} Challenges ({visible.length})</button>{canCreate && <button type="button" className="challenge-add" onClick={() => setComposing(true)}><Plus size={15}/> Add challenge</button>}</div>
    {expanded && <div className="game-challenge-list">{visible.length ? visible.map((row) => <ChallengeCard key={row.id} row={row} viewerId={viewerId}/>) : <p>No challenges for this game yet.</p>}</div>}
    {composing && <ChallengeComposer game={game} recipientId={recipientId} onClose={() => setComposing(false)}/>}
  </div>;
}

function ChallengeComposer({ game, recipientId, onClose }: { game: Game; recipientId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const element = dialog.current; element?.showModal(); title.current?.focus(); return () => { element?.close(); }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/challenges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipientId, igdbId: game.igdbId, title: title.current?.value, description }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not create the challenge.");
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the challenge."); setBusy(false); }
  }
  return <dialog ref={dialog} className="challenge-dialog" onClose={onClose} aria-labelledby="challenge-dialog-title"><form onSubmit={(event) => void submit(event)}>
    <div className="challenge-dialog-heading"><div><p className="eyebrow">NEW CHALLENGE</p><h2 id="challenge-dialog-title">Challenge for {game.name}</h2></div><button type="button" className="dialog-close" aria-label="Close" onClick={() => dialog.current?.close()}><X size={19}/></button></div>
    <label htmlFor="challenge-title">Title</label><input ref={title} id="challenge-title" name="title" maxLength={100} required placeholder="What should they try?"/>
    <label htmlFor="challenge-description">Description</label><textarea id="challenge-description" name="description" maxLength={1000} required rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the goal and any rules."/>
    {error && <p className="challenge-error" role="alert">{error}</p>}
    <div className="challenge-dialog-actions"><button type="button" onClick={() => dialog.current?.close()} disabled={busy}>Cancel</button><button type="submit" disabled={busy}>{busy ? "Adding…" : "Add challenge"}</button></div>
  </form></dialog>;
}

export function ChallengeSections({ rows, viewerId, ownerControls = false, title = "Challenges" }: { rows: Challenge[]; viewerId: string; ownerControls?: boolean; title?: string }) {
  const active = rows.filter((row) => !row.declined);
  const pending = active.filter((row) => !completed(row));
  const done = active.filter(completed);
  const declined = rows.filter((row) => row.declined);
  function cards(items: Challenge[]) {
    return <div className="challenge-grid">{items.map((row, index) => <ChallengeCard key={row.id} row={row} viewerId={viewerId} ownerControls={ownerControls} moveUp={index > 0} moveDown={index < items.length - 1}/>)}</div>;
  }
  function section(label: string, items: Challenge[]) {
    const favorites = items.filter((row) => row.isFavorite);
    const others = items.filter((row) => !row.isFavorite);
    return <section className="challenge-section"><div className="section-title"><div><p className="eyebrow">{label.toUpperCase()}</p><h2>{label} <span className="small-count">{items.length}</span></h2></div></div>{items.length ? <>{favorites.length > 0 && <div className="challenge-featured"><h3><Star size={17} fill="currentColor"/> Favorites</h3>{cards(favorites)}</div>}{others.length > 0 && cards(others)}</> : <p className="challenge-section-empty">No {label.toLowerCase()} challenges yet.</p>}</section>;
  }
  return <div className="profile-challenges"><div className="section-title"><div><p className="eyebrow">PLAYER CHALLENGES</p><h2>{title}</h2></div></div>{section("Pending", pending)}{section("Completed", done)}{declined.length > 0 && section("Declined", declined)}</div>;
}
