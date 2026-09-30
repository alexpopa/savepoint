"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, ChevronRight, ChevronUp, Circle, Flag, Gamepad2, Pencil, Plus, Search, Star, X } from "lucide-react";
import { challengeLogPageSize, filterChallenges } from "../lib/challenge-log";
import { honorLimit } from "../lib/challenge-queries";
import type { Challenge, ChallengeDetails } from "../lib/challenges";
import type { ConfirmationParticipant } from "../lib/permissions";

type Game = { igdbId: number; name: string };

function completed(row: Challenge) { return row.creatorConfirmed && row.recipientConfirmed && !row.declined; }

async function patch(id: number, action: string, participant?: ConfirmationParticipant, position?: number) {
  const response = await fetch(`/api/challenges/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, participant, position }) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Could not update the challenge.");
}

function ChallengeCard({ row, viewerId, ownerControls = false, canManage = false, hallFull = false, compact = false, onConfirmationChange, onOpen }: { row: Challenge; viewerId: string; ownerControls?: boolean; canManage?: boolean; hallFull?: boolean; compact?: boolean; onConfirmationChange?: (confirmed: boolean, participant: ConfirmationParticipant) => void; onOpen?: () => void }) {
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
  // Only completed challenges earn a place in the Hall of Honor; a starred one that was later unconfirmed can still be unstarred.
  const canFavorite = (isRecipient && ownerControls || canManage) && !row.declined && (row.isFavorite || isComplete);
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
      ? <button type="button" className="challenge-icon-button" disabled={busy || !row.isFavorite && hallFull} aria-label={row.isFavorite ? `Remove ${row.title} from the Hall of Honor` : `Add ${row.title} to the Hall of Honor`} title={row.isFavorite ? "Remove from Hall of Honor" : hallFull ? `Hall of Honor is full (${honorLimit})` : "Add to Hall of Honor"} onClick={() => void act(row.isFavorite ? "unfavorite" : "favorite")}><Star size={18} fill={row.isFavorite ? "currentColor" : "none"} aria-hidden="true"/></button>
      : row.isFavorite && <span className="challenge-favorite" role="img" aria-label="In the Hall of Honor"><Star size={18} fill="currentColor" aria-hidden="true"/></span>)}
    {canRemove && <button type="button" className="challenge-icon-button is-danger" disabled={busy} aria-label={`Remove ${row.title} completely`} title="Remove challenge" onClick={() => void remove()}><X size={19} aria-hidden="true"/></button>}
  </div>;
  if (compact) return <article className={`challenge-list-item ${cardState}`}>
    <button type="button" className="challenge-list-open" aria-label={`Open ${row.title} challenge details`} onClick={onOpen}><span role="heading" aria-level={3}>{row.title}</span><ChevronRight size={17} aria-hidden="true"/></button>
    {(canConfirm || canRemove) && tools}
    {error && <p className="challenge-error" role="alert">{error}</p>}
  </article>;
  return <article className={`challenge-card ${cardState} ${row.isFavorite ? "is-favorite" : ""}`}>
    {(cardStatus || canConfirm || canFavorite || canRemove || row.isFavorite) && <div className="challenge-card-top">
      {cardStatus && <span className="challenge-status"><Flag size={15} aria-hidden="true"/> {cardStatus}</span>}
      <div className="challenge-card-control-row">{tools}</div>
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


// The Hall of Honor holds the recipient's starred completed challenges in their chosen order,
// as covers in a wooden cabinet. Like the Top 10, a caption outside the cabinet names the hovered or
// focused challenge, and Edit picks a challenge up and sets it down by click, keyboard, or drag.
// Owners see the vacant places left until the limit.
export function HallOfHonor({ received, viewerId, ownerControls = false, canManage = false }: { received: Challenge[]; viewerId: string; ownerControls?: boolean; canManage?: boolean }) {
  const [honors, setHonors] = useState(() => received.filter((row) => completed(row) && row.isFavorite));
  const [arranging, setArranging] = useState(false);
  const [held, setHeld] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [lit, setLit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  if (!honors.length && !ownerControls) return null;
  async function place(id: number, position: number) {
    const from = honors.findIndex((row) => row.id === id);
    setHeld(null); setOver(null);
    if (from < 0 || from === position - 1) return;
    const previous = honors, next = [...honors];
    const [row] = next.splice(from, 1);
    next.splice(position - 1, 0, row);
    setHonors(next); setBusy(true); setError(""); setStatus(`${row.title} moved to ${position}.`);
    try { await patch(id, "place", undefined, position); }
    catch (cause) { setHonors(previous); setError(cause instanceof Error ? cause.message : "Could not update the challenge."); }
    finally { setBusy(false); }
  }
  async function remove(row: Challenge) {
    setBusy(true); setError(""); setHeld(null);
    try { await patch(row.id, "unfavorite"); window.location.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the challenge."); setBusy(false); }
  }
  function choose(row: Challenge, index: number) {
    if (!arranging) return setSelectedChallenge(row);
    if (busy) return;
    if (held === null) { setHeld(row.id); setStatus(`${row.title} picked up. Choose its new spot, or press Escape.`); }
    else if (held === row.id) { setHeld(null); setStatus(`${row.title} put back.`); }
    else void place(held, index + 1);
  }
  function toggleArranging() {
    setArranging(!arranging); setHeld(null); setOver(null);
    setStatus(arranging ? "" : "Select a challenge, then select its new spot.");
  }
  const heldIndex = honors.findIndex((row) => row.id === held);
  const heldRow = honors[heldIndex];
  const litRow = honors.find((row) => row.id === lit);
  const caption = arranging ? heldRow ? `Moving ${heldRow.title}` : "Select a challenge, then its new spot" : litRow?.title;
  const vacant = ownerControls && !arranging ? Math.max(honorLimit - honors.length, 0) : 0;
  // With nothing completed yet there is nothing to star, so the owner sees a note instead of an empty cabinet.
  const nothingToStar = !honors.length && !received.some(completed);
  return <section className="profile-section" aria-labelledby="hall-of-honor-title">
    <div className="profile-section-head">
      <h2 id="hall-of-honor-title" className="profile-label"><Star size={15} aria-hidden="true"/>Hall of Honor</h2>
      {(ownerControls || canManage) && honors.length > 0 && <button type="button" className="profile-tool" aria-pressed={arranging} onClick={toggleArranging}>
        {arranging ? <Check size={15} aria-hidden="true"/> : <Pencil size={15} aria-hidden="true"/>}{arranging ? "Done" : "Edit"}
      </button>}
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {nothingToStar ? <p className="challenge-section-empty honor-empty"><Star size={16} aria-hidden="true"/>Complete a challenge to proudly display it here.</p> : <>
    <div className={`honor-display${arranging ? " is-arranging" : ""}${held !== null ? " is-holding" : ""}`} onKeyDown={(event) => { if (event.key === "Escape" && held !== null) { setHeld(null); setStatus("Move cancelled."); } }}>
      <div className="honor-cabinet"><div className="honor-screen"><ol className="honor-rack">
        {honors.map((row, index) => {
          const target = over === index && held !== null && held !== row.id ? (heldIndex < index ? " is-target-after" : " is-target-before") : "";
          return <li key={row.id} className={`honor${held === row.id ? " is-held" : ""}${target}`}
            onDragOver={(event) => { if (held === null) return; event.preventDefault(); setOver(index); }}
            onDragLeave={() => setOver((current) => current === index ? null : current)}
            onDrop={(event) => { event.preventDefault(); if (held !== null) void place(held, index + 1); }}>
            <button type="button" className="honor-cover" draggable={arranging && !busy}
              aria-label={arranging
                ? held === null ? `${index + 1}. ${row.title}. Pick up to move` : held === row.id ? `${index + 1}. ${row.title}. Put back` : `Move ${heldRow?.title} to ${index + 1}, where ${row.title} is`
                : `View challenge details for ${row.title}`}
              aria-pressed={arranging ? held === row.id : undefined}
              onMouseEnter={() => setLit(row.id)} onMouseLeave={() => setLit(null)} onFocus={() => setLit(row.id)} onBlur={() => setLit(null)}
              onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(row.id)); setHeld(row.id); }}
              onDragEnd={() => { setHeld(null); setOver(null); }}
              onClick={() => choose(row, index)}>
              <HonorCover row={row}/>
            </button>
            {arranging && <button type="button" className="shelf-remove" aria-label={`Remove ${row.title} from the Hall of Honor`} title="Remove from Hall of Honor" disabled={busy} onClick={() => void remove(row)}><X size={14} aria-hidden="true"/></button>}
          </li>;
        })}
        {Array.from({ length: vacant }, (_, index) => <li key={`vacant-${index}`} className="honor is-vacant" aria-hidden="true"><span className="honor-cover"/></li>)}
      </ol>
      {ownerControls && !honors.length && <p className="honor-hint"><Star size={16} aria-hidden="true"/>Star a completed challenge to keep it here.</p>}
      </div></div>
      <p className="shelf-caption honor-caption" aria-hidden="true">{caption && <span>{caption}</span>}</p>
    </div>
    <p className="shelf-status" role="status">{status}</p>
    </>}
    {selectedChallenge && <ChallengeDetailsDialog row={selectedChallenge} viewerId={viewerId} onClose={() => setSelectedChallenge(null)}/>}
  </section>;
}

function HonorCover({ row }: { row: Challenge }) {
  const [failed, setFailed] = useState(false);
  return row.gameCoverUrl && !failed
    ? <img src={row.gameCoverUrl} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)}/>
    : <span className="cover-fallback challenge-cover-fallback"><Gamepad2 size={25} aria-hidden="true"/><span>{row.gameName.slice(0, 1)}</span></span>;
}

type LogTab = "pending" | "completed" | "sent";

// Pending, completed, and sent challenges share one searchable log that shows a few at a time.
// Challenges already in the Hall of Honor stay out of it.
export function ProfileChallenges({ received, sent, viewerId, ownerControls = false, canManage = false }: { received: Challenge[]; sent?: Challenge[]; viewerId: string; ownerControls?: boolean; canManage?: boolean }) {
  const [receivedRows, setReceivedRows] = useState(received);
  const [sentRows, setSentRows] = useState(sent ?? []);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(challengeLogPageSize);
  const [honorIds] = useState(() => new Set(received.filter((row) => completed(row) && row.isFavorite).map((row) => row.id)));
  const active = receivedRows.filter((row) => !row.declined);
  const hallFull = active.filter((row) => row.isFavorite).length >= honorLimit;
  const tabs: { key: LogTab; label: string; items: Challenge[]; empty: string }[] = [
    { key: "pending", label: "Pending", items: active.filter((row) => !completed(row)), empty: "Nothing pending." },
    { key: "completed", label: "Completed", items: active.filter((row) => completed(row) && !honorIds.has(row.id)), empty: honorIds.size ? "Every completed challenge is in the Hall of Honor." : "No completed challenges yet." },
    ...(sent ? [{ key: "sent" as const, label: "Sent", items: sentRows, empty: "No challenges sent yet." }] : []),
  ];
  const [tab, setTab] = useState<LogTab>(tabs[0].items.length || !tabs[1].items.length ? "pending" : "completed");
  const current = tabs.find((item) => item.key === tab) ?? tabs[0];
  const matching = filterChallenges(current.items, query);
  const visible = matching.slice(0, shown);
  const searchable = Boolean(query) || tabs.some((item) => item.items.length > 0);
  function updateConfirmation(id: number, confirmed: boolean, participant: ConfirmationParticipant) {
    const update = (rows: Challenge[]) => rows.map((row) => row.id !== id ? row
      : participant === "recipient" ? { ...row, recipientConfirmed: confirmed } : { ...row, creatorConfirmed: confirmed });
    setReceivedRows(update);
    setSentRows(update);
  }
  function selectTab(key: LogTab) { setTab(key); setShown(challengeLogPageSize); }
  function focusTab(index: number) {
    const next = tabs[(index + tabs.length) % tabs.length];
    selectTab(next.key);
    document.getElementById(`challenge-tab-${next.key}`)?.focus();
  }
  return <section className="profile-section challenge-log" aria-labelledby="challenge-log-title">
    <div className="profile-section-head"><h2 id="challenge-log-title" className="profile-label"><Flag size={15} aria-hidden="true"/>Challenges</h2></div>
    <div className="profile-tabs" role="tablist" aria-labelledby="challenge-log-title">
      {tabs.map((item, index) => <button key={item.key} type="button" role="tab" id={`challenge-tab-${item.key}`} aria-selected={item.key === current.key} aria-controls="challenge-log-panel" tabIndex={item.key === current.key ? 0 : -1} className="profile-tab" onClick={() => selectTab(item.key)} onKeyDown={(event) => {
        if (event.key === "ArrowRight") { event.preventDefault(); focusTab(index + 1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); focusTab(index - 1); }
      }}>{item.label}<span className="profile-tab-count">{item.items.length}</span></button>)}
    </div>
    {searchable && <div className="challenge-log-tools">
      <label className="library-search"><span>Search challenges</span><span className="library-search-field"><Search size={17} aria-hidden="true"/><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setShown(challengeLogPageSize); }} placeholder="Game, challenge, or player" maxLength={100} autoComplete="off" spellCheck={false}/></span></label>
      {current.items.length > 0 && <p className="library-results" role="status">{matching.length ? `Showing ${visible.length} of ${matching.length} ${query.trim() ? "matching " : ""}${matching.length === 1 ? "challenge" : "challenges"}` : "No matching challenges"}</p>}
    </div>}
    <div className="profile-tab-panel" role="tabpanel" id="challenge-log-panel" aria-labelledby={`challenge-tab-${current.key}`}>
      {!current.items.length ? <p className="challenge-section-empty">{current.empty}</p>
        : !matching.length ? <div className="challenge-section-empty challenge-no-match"><p>No {current.label.toLowerCase()} challenges match “{query.trim()}”.</p><button type="button" className="library-clear" onClick={() => setQuery("")}>Clear search</button></div>
        : <div className="challenge-grid">{visible.map((row) => <ChallengeCard key={row.id} row={row} viewerId={viewerId} ownerControls={ownerControls && current.key !== "sent"} canManage={canManage} hallFull={hallFull} onConfirmationChange={(confirmed, participant) => updateConfirmation(row.id, confirmed, participant)} onOpen={() => setSelectedChallenge(row)}/>)}</div>}
      {matching.length > shown && <button type="button" className="profile-tool challenge-more" onClick={() => setShown(shown + challengeLogPageSize)}>Show more ({matching.length - shown})</button>}
    </div>
    {selectedChallenge && <ChallengeDetailsDialog row={selectedChallenge} viewerId={viewerId} onClose={() => setSelectedChallenge(null)}/>}
  </section>;
}
