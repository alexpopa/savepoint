"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronUp, Circle, Flag, Gamepad2, Plus, Star, X } from "lucide-react";
import type { Challenge } from "../lib/challenges";

type Game = { igdbId: number; name: string };

function completed(row: Challenge) { return row.creatorConfirmed && row.recipientConfirmed && !row.declined; }

async function patch(id: number, action: string) {
  const response = await fetch(`/api/challenges/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Could not update the challenge.");
}

function ChallengeCard({ row, viewerId, ownerControls = false, moveUp = false, moveDown = false, compact = false, onConfirmationChange, onOpen }: { row: Challenge; viewerId: string; ownerControls?: boolean; moveUp?: boolean; moveDown?: boolean; compact?: boolean; onConfirmationChange?: (confirmed: boolean) => void; onOpen?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  const isRecipient = viewerId === row.recipientId;
  const isCreator = viewerId === row.creatorId;
  const [myConfirmed, setMyConfirmed] = useState(() => isRecipient ? row.recipientConfirmed : row.creatorConfirmed);
  const isComplete = !row.declined && (isRecipient
    ? row.creatorConfirmed && myConfirmed
    : isCreator
      ? row.recipientConfirmed && myConfirmed
      : completed(row));
  const cardStatus = compact ? "" : row.declined ? "Declined" : isComplete ? "" : "Pending";
  const canConfirm = (isRecipient || isCreator) && !row.declined;
  const canRemove = isRecipient;
  const canFavorite = isRecipient && ownerControls && !row.declined;
  const canRank = !compact && isRecipient && ownerControls && row.isFavorite && !row.declined;
  const cardState = row.declined ? "is-declined" : isComplete ? "is-complete" : "is-pending";
  async function act(action: string) {
    setBusy(true); setError("");
    try {
      await patch(row.id, action);
      if (action === "confirm" || action === "unconfirm") {
        const confirmed = action === "confirm";
        setMyConfirmed(confirmed);
        onConfirmationChange?.(confirmed);
        setBusy(false);
        return;
      }
      window.location.reload();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the challenge."); setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Permanently delete “${row.title}” for both players? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/challenges/${row.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not delete the challenge.");
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the challenge."); setBusy(false); }
  }
  const tools = <div className="challenge-card-tools">
    {canConfirm && <button type="button" className={`challenge-icon-button is-confirmation ${myConfirmed ? "is-confirmed" : ""}`} disabled={busy} aria-label={myConfirmed ? `Undo your confirmation for ${row.title}` : `Confirm ${row.title}`} aria-pressed={myConfirmed} title={myConfirmed ? "Undo confirmation" : "Confirm challenge"} onClick={() => void act(myConfirmed ? "unconfirm" : "confirm")}><Circle size={19} fill={myConfirmed ? "currentColor" : "none"} aria-hidden="true"/></button>}
    {!compact && (canFavorite
      ? <button type="button" className="challenge-icon-button" disabled={busy} aria-label={row.isFavorite ? `Remove ${row.title} from favorites` : `Favorite ${row.title}`} title={row.isFavorite ? "Unfavorite" : "Favorite"} onClick={() => void act(row.isFavorite ? "unfavorite" : "favorite")}><Star size={18} fill={row.isFavorite ? "currentColor" : "none"} aria-hidden="true"/></button>
      : row.isFavorite && <span className="challenge-favorite" role="img" aria-label="Favorite"><Star size={18} fill="currentColor" aria-hidden="true"/></span>)}
    {canRemove && <button type="button" className="challenge-icon-button is-danger" disabled={busy} aria-label={`Remove ${row.title} completely`} title="Remove challenge" onClick={() => void remove()}><X size={19} aria-hidden="true"/></button>}
  </div>;
  const rankTools = canRank && <div className="challenge-rank-tools">
    <button type="button" className="challenge-icon-button" disabled={busy || !moveUp} aria-label={`Move ${row.title} up`} title="Move up" onClick={() => void act("move_up")}><ArrowUp size={17} aria-hidden="true"/></button>
    <button type="button" className="challenge-icon-button" disabled={busy || !moveDown} aria-label={`Move ${row.title} down`} title="Move down" onClick={() => void act("move_down")}><ArrowDown size={17} aria-hidden="true"/></button>
  </div>;
  if (compact) return <article className={`challenge-list-item ${cardState}`}>
    <button type="button" className="challenge-list-open" aria-label={`Open ${row.title} challenge details`} onClick={onOpen}><span role="heading" aria-level={3}>{row.title}</span><ChevronRight size={17} aria-hidden="true"/></button>
    {(canConfirm || canRemove) && tools}
    {error && <p className="challenge-error" role="alert">{error}</p>}
  </article>;
  return <article className={`challenge-card ${cardState} ${row.isFavorite ? "is-favorite" : ""}`}>
    {(cardStatus || canConfirm || canFavorite || canRemove || row.isFavorite) && <div className="challenge-card-top">
      {cardStatus && <span className="challenge-status"><Flag size={15} aria-hidden="true"/> {cardStatus}</span>}
      <div className="challenge-card-control-row">
        {rankTools}
        {tools}
      </div>
    </div>}
    <div className="challenge-card-main">
      <button type="button" className="challenge-card-cover-open" aria-label={`View challenge details for ${row.title}`} onClick={onOpen}>
        <span className="challenge-game-cover">
          {row.gameCoverUrl && !coverUnavailable
            ? <img src={row.gameCoverUrl} alt={`${row.gameName} cover`} loading="lazy" onError={() => setCoverUnavailable(true)}/>
            : <span className="cover-fallback challenge-cover-fallback"><Gamepad2 size={25} aria-hidden="true"/><span>{row.gameName.slice(0, 1)}</span></span>}
        </span>
      </button>
      <div className="challenge-card-content">
        <p className="challenge-game-title">{row.gameName}</p>
        <button type="button" className="challenge-card-open" aria-label={`Open ${row.title} challenge details`} onClick={onOpen}>
          <span className="challenge-card-title" role="heading" aria-level={3}>{row.title}</span><ChevronRight size={19} aria-hidden="true"/>
        </button>
        <p className="challenge-byline">{isCreator ? "For" : "From"} <a className="inline-link" href={isCreator ? row.recipientProfilePath : row.creatorProfilePath}>{isCreator ? row.recipientName : row.creatorName}</a></p>
      </div>
    </div>
    {error && <p className="challenge-error" role="alert">{error}</p>}
  </article>;
}

export function GameChallenges({ game, recipientId, viewerId, rows, canCreate = false }: { game: Game; recipientId: string; viewerId: string; rows: Challenge[]; canCreate?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const visible = rows.filter((row) => row.igdbId === game.igdbId && !row.declined);
  return <>
    <div className="game-challenges">
      <div className="game-challenge-actions"><button type="button" className="challenge-link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>} Challenges ({visible.length})</button>{canCreate && <button type="button" className="challenge-add" onClick={() => setComposing(true)}><Plus size={15}/> Add challenge</button>}</div>
      {expanded && <div className="game-challenge-list">{visible.length ? visible.map((row) => <ChallengeCard key={row.id} row={row} viewerId={viewerId} compact onOpen={() => setSelectedChallenge(row)}/>) : <p>No challenges for this game yet.</p>}</div>}
      {composing && <ChallengeComposer game={game} recipientId={recipientId} onClose={() => setComposing(false)}/>}
    </div>
    {selectedChallenge && <ChallengeDetailsDialog row={selectedChallenge} viewerId={viewerId} onClose={() => setSelectedChallenge(null)}/>}
  </>;
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

function ChallengeDetailsDialog({ row, viewerId, onClose }: { row: Challenge; viewerId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `challenge-details-title-${row.id}`;
  const descriptionId = `challenge-details-description-${row.id}`;
  const isCreator = viewerId === row.creatorId;
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  return <dialog ref={dialog} className="challenge-details-dialog" onClose={onClose} aria-labelledby={titleId} aria-describedby={descriptionId}>
    <div className="challenge-details-header"><span className="eyebrow"><Flag size={14} aria-hidden="true"/> CHALLENGE DETAILS</span><button type="button" className="dialog-close" aria-label="Close challenge details" onClick={() => dialog.current?.close()}><X size={19}/></button></div>
    <div className="challenge-details-content">
      <div className="challenge-details-hero">
        <div className="challenge-details-art">
          {row.gameCoverUrl && !coverUnavailable
            ? <img src={row.gameCoverUrl} alt={`${row.gameName} cover`} onError={() => setCoverUnavailable(true)}/>
            : <div className="cover-fallback challenge-cover-fallback" role="img" aria-label={`${row.gameName} cover unavailable`}><Gamepad2 size={32} aria-hidden="true"/><span>{row.gameName.slice(0, 1)}</span></div>}
        </div>
        <div className="challenge-details-intro"><p className="challenge-details-game"><Gamepad2 size={16} aria-hidden="true"/>{row.gameName}</p><h2 id={titleId}>{row.title}</h2></div>
      </div>
      <section className="challenge-details-description" aria-labelledby={`${titleId}-description-heading`}>
        <h3 id={`${titleId}-description-heading`}>Description</h3>
        <p id={descriptionId}>{row.description}</p>
      </section>
      <p className="challenge-details-byline">{isCreator ? "For" : "From"} <a className="inline-link" href={isCreator ? row.recipientProfilePath : row.creatorProfilePath}>{isCreator ? row.recipientName : row.creatorName}</a></p>
      <div className="challenge-details-actions"><button type="button" onClick={() => dialog.current?.close()}>Close</button></div>
    </div>
  </dialog>;
}

export function ChallengeSections({ rows, viewerId, ownerControls = false, title = "Challenges" }: { rows: Challenge[]; viewerId: string; ownerControls?: boolean; title?: string }) {
  const [currentRows, setCurrentRows] = useState(rows);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const active = currentRows.filter((row) => !row.declined);
  const pending = active.filter((row) => !completed(row));
  const done = active.filter(completed);
  const declined = currentRows.filter((row) => row.declined);
  function updateConfirmation(id: number, confirmed: boolean) {
    setCurrentRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      if (row.recipientId === viewerId) return { ...row, recipientConfirmed: confirmed };
      if (row.creatorId === viewerId) return { ...row, creatorConfirmed: confirmed };
      return row;
    }));
  }
  function cards(items: Challenge[]) {
    return <div className="challenge-grid">{items.map((row, index) => <ChallengeCard key={row.id} row={row} viewerId={viewerId} ownerControls={ownerControls} moveUp={index > 0} moveDown={index < items.length - 1} onConfirmationChange={(confirmed) => updateConfirmation(row.id, confirmed)} onOpen={() => setSelectedChallenge(row)}/>)}</div>;
  }
  function section(label: string, items: Challenge[]) {
    const favorites = items.filter((row) => row.isFavorite);
    const others = items.filter((row) => !row.isFavorite);
    return <section className="challenge-section"><div className="section-title"><div><p className="eyebrow">{label.toUpperCase()}</p><h2>{label} <span className="small-count">{items.length}</span></h2></div></div>{items.length ? <>{favorites.length > 0 && <div className="challenge-featured"><h3><Star size={17} fill="currentColor"/> Favorites</h3>{cards(favorites)}</div>}{others.length > 0 && cards(others)}</> : <p className="challenge-section-empty">No {label.toLowerCase()} challenges yet.</p>}</section>;
  }
  return <>
    <div className="profile-challenges"><div className="section-title"><div><p className="eyebrow">PLAYER CHALLENGES</p><h2>{title}</h2></div></div>{section("Pending", pending)}{section("Completed", done)}{declined.length > 0 && section("Declined", declined)}</div>
    {selectedChallenge && <ChallengeDetailsDialog row={selectedChallenge} viewerId={viewerId} onClose={() => setSelectedChallenge(null)}/>}
  </>;
}
