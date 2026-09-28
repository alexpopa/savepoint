"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronUp, Circle, Flag, Gamepad2, Plus, Star, Trophy, X } from "lucide-react";
import type { Challenge, ChallengeDetails } from "../lib/challenges";
import type { ConfirmationParticipant } from "../lib/permissions";

type Game = { igdbId: number; name: string };

function completed(row: Challenge) { return row.creatorConfirmed && row.recipientConfirmed && !row.declined; }

async function patch(id: number, action: string, participant?: ConfirmationParticipant) {
  const response = await fetch(`/api/challenges/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, participant }) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Could not update the challenge.");
}

function ChallengeCard({ row, viewerId, ownerControls = false, canManage = false, moveUp = false, moveDown = false, compact = false, onConfirmationChange, onOpen }: { row: Challenge; viewerId: string; ownerControls?: boolean; canManage?: boolean; moveUp?: boolean; moveDown?: boolean; compact?: boolean; onConfirmationChange?: (confirmed: boolean, participant: ConfirmationParticipant) => void; onOpen?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  const isRecipient = viewerId === row.recipientId;
  const isCreator = viewerId === row.creatorId;
  const [confirmations, setConfirmations] = useState({ recipient: row.recipientConfirmed, creator: row.creatorConfirmed });
  const participant: ConfirmationParticipant = isCreator ? "creator" : "recipient";
  const isComplete = !row.declined && confirmations.recipient && confirmations.creator;
  const cardStatus = compact ? "" : row.declined ? "Declined" : isComplete ? "" : "Pending";
  const canConfirm = (isRecipient || isCreator || canManage) && !row.declined;
  const canRemove = isRecipient || canManage;
  const canFavorite = (isRecipient && ownerControls || canManage) && !row.declined;
  const canRank = !compact && (isRecipient && ownerControls || canManage) && row.isFavorite && !row.declined;
  const cardState = row.declined ? "is-declined" : isComplete ? "is-complete" : "is-pending";
  async function act(action: string, selectedParticipant: ConfirmationParticipant = participant) {
    setBusy(true); setError("");
    try {
      await patch(row.id, action, action === "confirm" || action === "unconfirm" ? selectedParticipant : undefined);
      if (action === "confirm" || action === "unconfirm") {
        const confirmed = action === "confirm";
        setConfirmations((current) => ({ ...current, [selectedParticipant]: confirmed }));
        onConfirmationChange?.(confirmed, selectedParticipant);
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
  const otherParticipant: ConfirmationParticipant = participant === "recipient" ? "creator" : "recipient";
  const confirmationButton = (selectedParticipant: ConfirmationParticipant, own: boolean) => {
    const confirmed = confirmations[selectedParticipant];
    const label = own
      ? confirmed ? "Undo your confirmation" : "Confirm challenge"
      : confirmed ? `Undo ${selectedParticipant}'s confirmation` : `Confirm for ${selectedParticipant}`;
    return <button type="button" className={`challenge-icon-button is-confirmation ${confirmed ? "is-confirmed" : ""}`} disabled={busy} aria-label={`${label} for ${row.title}`} aria-pressed={confirmed} title={label} onClick={() => void act(confirmed ? "unconfirm" : "confirm", selectedParticipant)}><Circle size={19} fill={confirmed ? "currentColor" : "none"} aria-hidden="true"/></button>;
  };
  const tools = <div className="challenge-card-tools">
    {canConfirm && confirmationButton(participant, isRecipient || isCreator)}
    {canConfirm && canManage && confirmationButton(otherParticipant, false)}
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

export function GameChallenges({ game, recipientId, viewerId, rows, canCreate = false, canManage = false }: { game: Game; recipientId: string; viewerId: string; rows: Challenge[]; canCreate?: boolean; canManage?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const visible = rows.filter((row) => row.igdbId === game.igdbId && !row.declined);
  return <>
    <div className="game-challenges">
      <div className="game-challenge-actions"><button type="button" className="challenge-link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>} Challenges ({visible.length})</button>{canCreate && <button type="button" className="challenge-add" onClick={() => setComposing(true)}><Plus size={15}/> Add challenge</button>}</div>
      {expanded && <div className="game-challenge-list">{visible.length ? visible.map((row) => <ChallengeCard key={row.id} row={row} viewerId={viewerId} canManage={canManage} compact onOpen={() => setSelectedChallenge(row)}/>) : <p>No challenges for this game yet.</p>}</div>}
      {composing && <ChallengeComposer game={game} recipientId={recipientId} onClose={() => setComposing(false)}/>}
    </div>
    {selectedChallenge && <ChallengeDetailsDialog row={selectedChallenge} viewerId={viewerId} onClose={() => setSelectedChallenge(null)}/>}
  </>;
}

export function TimelineChallengeButton({ game, recipientId }: { game: Game; recipientId: string }) {
  const [composing, setComposing] = useState(false);
  return <>
    <button type="button" className="challenge-add timeline-challenge-add" aria-label={`Add a challenge for ${game.name}`} onClick={() => setComposing(true)}><Plus size={15} aria-hidden="true"/> Add challenge</button>
    {composing && <ChallengeComposer game={game} recipientId={recipientId} onClose={() => setComposing(false)}/>}
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

export function ChallengeDetailsDialog({ row, viewerId, onClose }: { row: ChallengeDetails; viewerId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `challenge-details-title-${row.id}`;
  const descriptionId = `challenge-details-description-${row.id}`;
  const isCreator = viewerId === row.creatorId;
  const isRecipient = viewerId === row.recipientId;
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
      <p className="challenge-details-byline">{isCreator
        ? <>For <a className="inline-link" href={row.recipientProfilePath}>{row.recipientName}</a></>
        : isRecipient
          ? <>From <a className="inline-link" href={row.creatorProfilePath}>{row.creatorName}</a></>
          : <><a className="inline-link" href={row.creatorProfilePath}>{row.creatorName}</a> challenged <a className="inline-link" href={row.recipientProfilePath}>{row.recipientName}</a></>}
      </p>
      <div className="challenge-details-actions"><button type="button" onClick={() => dialog.current?.close()}>Close</button></div>
    </div>
  </dialog>;
}

type LogTab = "pending" | "completed" | "sent";

// Favorite completed challenges are the player's trophies; everything else lives in the tabbed log.
export function ProfileChallenges({ received, sent, viewerId, ownerControls = false, canManage = false }: { received: Challenge[]; sent?: Challenge[]; viewerId: string; ownerControls?: boolean; canManage?: boolean }) {
  const [receivedRows, setReceivedRows] = useState(received);
  const [sentRows, setSentRows] = useState(sent ?? []);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const active = receivedRows.filter((row) => !row.declined);
  const pending = active.filter((row) => !completed(row));
  const done = active.filter(completed);
  const trophies = done.filter((row) => row.isFavorite);
  const tabs: { key: LogTab; label: string; items: Challenge[]; empty: string }[] = [
    { key: "pending", label: "Pending", items: pending, empty: "Nothing pending." },
    { key: "completed", label: "Completed", items: done, empty: "No completed challenges yet." },
    ...(sent ? [{ key: "sent" as const, label: "Sent", items: sentRows, empty: "No challenges sent yet." }] : []),
  ];
  const [tab, setTab] = useState<LogTab>(pending.length || !done.length ? "pending" : "completed");
  const current = tabs.find((item) => item.key === tab) ?? tabs[0];
  function updateConfirmation(id: number, confirmed: boolean, participant: ConfirmationParticipant) {
    const update = (rows: Challenge[]) => rows.map((row) => row.id !== id ? row
      : participant === "recipient" ? { ...row, recipientConfirmed: confirmed } : { ...row, creatorConfirmed: confirmed });
    setReceivedRows(update);
    setSentRows(update);
  }
  function focusTab(index: number) {
    const next = tabs[(index + tabs.length) % tabs.length];
    setTab(next.key);
    document.getElementById(`challenge-tab-${next.key}`)?.focus();
  }
  function cards(items: Challenge[], rankable: boolean) {
    return <div className="challenge-grid">{items.map((row, index) => <ChallengeCard key={row.id} row={row} viewerId={viewerId} ownerControls={ownerControls && rankable} canManage={canManage} moveUp={index > 0} moveDown={index < items.length - 1} onConfirmationChange={(confirmed, participant) => updateConfirmation(row.id, confirmed, participant)} onOpen={() => setSelectedChallenge(row)}/>)}</div>;
  }
  function panel(items: Challenge[], rankable: boolean, empty: string) {
    if (!items.length) return <p className="challenge-section-empty">{empty}</p>;
    const favorites = rankable ? items.filter((row) => row.isFavorite) : [];
    const others = rankable ? items.filter((row) => !row.isFavorite) : items;
    return <>
      {favorites.length > 0 && <div className="challenge-featured"><h3><Star size={17} fill="currentColor" aria-hidden="true"/> Favorites</h3>{cards(favorites, true)}</div>}
      {others.length > 0 && cards(others, rankable)}
    </>;
  }
  return <>
    {(trophies.length > 0 || ownerControls) && <section className="profile-section" aria-labelledby="trophies-title">
      <div className="profile-section-head"><h2 id="trophies-title" className="profile-label"><Trophy size={15} aria-hidden="true"/>Trophies</h2></div>
      {trophies.length
        ? <ol className="trophy-case">{trophies.map((row) => <TrophyCard key={row.id} row={row} viewerId={viewerId} onOpen={() => setSelectedChallenge(row)}/>)}</ol>
        : <p className="trophy-empty"><Star size={16} aria-hidden="true"/>Star a completed challenge to keep it here.</p>}
    </section>}
    <section className="profile-section challenge-log" aria-labelledby="challenge-log-title">
      <div className="profile-section-head"><h2 id="challenge-log-title" className="profile-label"><Flag size={15} aria-hidden="true"/>Challenges</h2></div>
      <div className="profile-tabs" role="tablist" aria-labelledby="challenge-log-title">
        {tabs.map((item, index) => <button key={item.key} type="button" role="tab" id={`challenge-tab-${item.key}`} aria-selected={item.key === current.key} aria-controls="challenge-log-panel" tabIndex={item.key === current.key ? 0 : -1} className="profile-tab" onClick={() => setTab(item.key)} onKeyDown={(event) => {
          if (event.key === "ArrowRight") { event.preventDefault(); focusTab(index + 1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); focusTab(index - 1); }
        }}>{item.label}<span className="profile-tab-count">{item.items.length}</span></button>)}
      </div>
      <div className="profile-tab-panel" role="tabpanel" id="challenge-log-panel" aria-labelledby={`challenge-tab-${current.key}`}>
        {panel(current.items, current.key !== "sent", current.empty)}
      </div>
    </section>
    {selectedChallenge && <ChallengeDetailsDialog row={selectedChallenge} viewerId={viewerId} onClose={() => setSelectedChallenge(null)}/>}
  </>;
}

function TrophyCard({ row, viewerId, onOpen }: { row: Challenge; viewerId: string; onOpen: () => void }) {
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  return <li className="trophy">
    <button type="button" className="trophy-cover" aria-label={`View challenge details for ${row.title}`} onClick={onOpen}>
      {row.gameCoverUrl && !coverUnavailable
        ? <img src={row.gameCoverUrl} alt={`${row.gameName} cover`} loading="lazy" onError={() => setCoverUnavailable(true)}/>
        : <span className="cover-fallback challenge-cover-fallback"><Gamepad2 size={25} aria-hidden="true"/><span>{row.gameName.slice(0, 1)}</span></span>}
    </button>
    <div className="trophy-body">
      <p className="trophy-game">{row.gameName}</p>
      <button type="button" className="trophy-title" onClick={onOpen}><span role="heading" aria-level={3}>{row.title}</span></button>
      <p className="trophy-by"><span className="trophy-seal" role="img" aria-label="Completed by both players"><Circle size={9} fill="currentColor" aria-hidden="true"/><Circle size={9} fill="currentColor" aria-hidden="true"/></span>
        {row.creatorId === viewerId ? "From you" : <>From <a className="inline-link" href={row.creatorProfilePath}>{row.creatorName}</a></>}</p>
    </div>
  </li>;
}
