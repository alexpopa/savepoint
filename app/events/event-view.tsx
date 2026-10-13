"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CalendarDays, CircleCheck, Gamepad2, LoaderCircle, Lock, Medal, Pencil, Plus, RefreshCw, Settings, Trophy, X } from "lucide-react";
import GameDetailsDialog from "../game-details-dialog";
import GamePicker, { libraryParams, pickerRequest, type PickerSource } from "../game-picker";
import type { Platform } from "../platform-filter";
import { eventDays, statusLabels } from "../../lib/event-rules";
import type { EventDetail, EventGameView } from "../../lib/events";
import type { CatalogGame, SavedGame } from "../../lib/game-types";
import type { LibraryCopy } from "../../lib/library-copies-query";
import { formatHours, hoursInput, parseHours } from "../../lib/playtime";

type Result = { message?: string; event?: EventDetail | null; error?: string };
export async function eventRequest(id: number, body: Record<string, unknown>) {
  const response = await fetch(`/api/events/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as Result;
  if (!response.ok) throw new Error(result.error || "Could not update the event.");
  return result;
}

const librarySource: PickerSource = {
  async load({ query, platformIds, cursor }, signal) {
    const page = await pickerRequest<{ items: LibraryCopy[]; next: string | null; platforms?: Platform[] }>(`/api/library/copies?${libraryParams(query, platformIds, cursor)}`, signal, "Could not load your library.");
    return { ...page, items: page.items.map((copy) => ({ id: copy.id, name: copy.name, coverUrl: copy.coverUrl, detail: copy.platformName || "Platform not set" })) };
  },
};

const subscribe = () => () => {};
const points = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
const hours = (minutes: number) => formatHours(minutes);

export default function EventView({ initial }: { initial: EventDetail }) {
  const [detail, setDetail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<CatalogGame | null>(null);
  const [copies, setCopies] = useState<SavedGame[]>([]);
  // Local times print only in the browser, so the server render never disagrees with it.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const baselineAsked = useRef(false);
  const { event, viewer, standings } = detail;
  const member = viewer.member;
  const joined = member?.status === "joined";
  const [playerId, setPlayerId] = useState<string | null>(joined ? viewer.userId : standings[0]?.userId ?? null);
  const player = standings.find((row) => row.userId === playerId) ?? null;
  const games = detail.games.filter((game) => game.userId === playerId);
  const ownGames = detail.games.filter((game) => game.userId === viewer.userId);

  async function act(body: Record<string, unknown>, progress = "") {
    setBusy(true); setWorking(progress); setError(""); setNotice("");
    try {
      const result = await eventRequest(event.id, body);
      if (!result.event) { window.location.assign(new URL("/events", window.location.origin)); return; }
      setDetail(result.event); setNotice(result.message ?? "");
      if (body.action === "join" || body.action === "baseline") setPlayerId(viewer.userId);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not update the event."); }
    finally { setBusy(false); setWorking(""); }
  }

  // The first visit after the start sets the player's starting point, so their time played counts from now.
  const needsBaseline = joined && event.status === "live" && !member?.baselineAt;
  useEffect(() => {
    if (!needsBaseline || baselineAsked.current) return;
    baselineAsked.current = true;
    void Promise.resolve().then(() => act({ action: "baseline" }, "Setting your starting point…"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsBaseline]);

  async function openGame(game: EventGameView) {
    setError("");
    try {
      const response = await fetch("/api/library");
      const result = await response.json() as { games?: SavedGame[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load your library.");
      setCopies(result.games ?? []);
      setSelected({ igdbId: game.igdbId, name: game.name, coverUrl: game.coverUrl, releaseYear: null, platforms: [], platformOptions: [] });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load your library."); }
  }

  const editable = (game: EventGameView) => viewer.host || (game.userId === viewer.userId && joined && event.status !== "ended");
  const ownView = playerId === viewer.userId;
  const totals = games.reduce((sum, game) => ({ achievements: sum.achievements + game.achievements }), { achievements: 0 });

  return <>
    <div className="page-heading event-heading"><div>
      <p className="eyebrow"><Trophy size={14} aria-hidden="true"/> EVENT <span className={`event-status is-${event.status}`}>{statusLabels[event.status]}</span>{event.visibility === "private" && <span className="event-private"><Lock size={13} aria-hidden="true"/>Private</span>}</p>
      <h1>{event.name}</h1>
      <p className="event-dates"><CalendarDays size={16} aria-hidden="true"/>{eventDays(event.startDay, event.endDay)} · {event.timeZone.replaceAll("_", " ")}</p>
      {event.description && <p className="subcopy event-description">{event.description}</p>}
      <p className="event-hosts">Hosted by {[detail.owner, ...detail.hosts].map((host) => host.name).join(", ")}</p>
    </div>{viewer.host && <a className="event-create" href={`/events/${event.id}/settings`}><Settings size={18} aria-hidden="true"/>Manage</a>}</div>
    {event.rules && <details className="event-rules"><summary>Rules</summary><p>{event.rules}</p></details>}
    {error && <p className="notice error" role="alert"><X size={17} aria-hidden="true"/>{error}</p>}
    {notice && !working && <p className="notice success" role="status">{notice}</p>}

    <section className="settings-card event-membership" aria-label="Your place in this event">
      {working ? <p className="muted" role="status"><LoaderCircle className="spin" size={17} aria-hidden="true"/>{working}</p>
        : member?.status === "invited" && event.status !== "ended" ? <>
          <p><strong>You’re invited.</strong> {event.status === "live" ? "Your time played counts from when you join." : "Your time played counts from your first visit after it starts."}</p>
          {viewer.privateProfile && event.visibility === "public" && <p className="event-note">Your profile is private. Joining shows your games and hours in this event to every signed-in player.</p>}
          <div className="person-actions"><button disabled={busy} onClick={() => void act({ action: "join" }, event.status === "live" ? "Setting your starting point…" : "")}>Accept</button><button className="secondary" disabled={busy} onClick={() => void act({ action: "decline" })}>Decline</button></div>
        </> : !joined ? event.status === "ended" ? <p>This event has ended. Results are final.</p> : event.visibility === "private" && member?.status !== "left" && !viewer.host ? <p>Only invited players can join this event.</p> : <>
          <p>{event.status === "live" ? "Join to count the games you play from now until the end." : "Join now. Your time played counts from your first visit after it starts."}</p>
          {viewer.privateProfile && event.visibility === "public" && <p className="event-note">Your profile is private. Joining shows your games and hours in this event to every signed-in player.</p>}
          <div className="person-actions"><button disabled={busy} onClick={() => void act({ action: "join" }, event.status === "live" ? "Setting your starting point…" : "")}>{member?.status === "left" ? "Rejoin" : "Join"}</button></div>
        </> : event.status === "upcoming" ? <>
          <p>You’re in. Your time played counts from your first visit after it starts.</p>
          <div className="person-actions"><button className="secondary" disabled={busy} onClick={() => void act({ action: "leave" })}>Leave</button></div>
        </> : event.status === "live" ? <>
          <p>{mounted && member?.updatedAt ? `Last updated ${new Date(member.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "Update to bring in your latest play."} Update before the event ends; results lock then.</p>
          <div className="person-actions"><button disabled={busy} onClick={() => void act({ action: "update" }, "Updating from your connected libraries…")}><RefreshCw size={16} aria-hidden="true"/> Update</button><button className="secondary" disabled={busy} onClick={() => setPicking(true)}><Plus size={16} aria-hidden="true"/> Add a game</button><button className="secondary" disabled={busy} onClick={() => void act({ action: "leave" })}>Leave</button></div>
        </> : <p>This event has ended. Results are final{viewer.host ? "; as a host you can still correct them" : ""}.</p>}
    </section>

    <section className="events-section" aria-labelledby="event-board-title">
      <div className="section-title"><div><p className="eyebrow"><Medal size={14} aria-hidden="true"/> LEADERBOARD</p><h2 id="event-board-title">{event.status === "ended" ? "Final standings" : "Standings"}</h2></div></div>
      {standings.length ? <table className="event-board"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Score</th><th scope="col">Beaten</th><th scope="col" className="is-wide">100%</th><th scope="col" className="is-wide">Hours</th></tr></thead>
        <tbody>{standings.map((row) => <tr key={row.userId} className={row.userId === playerId ? "is-selected" : undefined}>
          <td>{row.rank}</td>
          <th scope="row"><button type="button" className="event-player" aria-pressed={row.userId === playerId} onClick={() => setPlayerId(row.userId)}>{row.name}{row.userId === viewer.userId ? " (you)" : ""}</button></th>
          <td>{points(row.score)}</td><td>{row.beaten}</td><td className="is-wide">{row.completed}</td><td className="is-wide">{hours(row.minutes)}</td>
        </tr>)}</tbody></table> : <p className="muted">No players yet.</p>}
      <p className="event-scoring">Each hour scores {points(event.hourPoints)}. A beaten game adds {points(event.beatenPoints)} per hour{event.completedPoints ? `, and 100% adds ${points(event.completedPoints)} more` : ""}.</p>
      {detail.multipliers.length > 0 && <details className="event-rules"><summary>Platforms and games that score differently ({detail.multipliers.length})</summary><ul className="event-multiplier-list">{detail.multipliers.map((row) =>
        <li key={row.id}><strong>{row.name}</strong><span>{points(row.hourPoints)} per hour · beaten +{points(row.beatenPoints)} · 100% +{points(row.completedPoints)}</span></li>)}</ul></details>}
    </section>

    {player && <section className="events-section" aria-labelledby="event-games-title">
      <div className="section-title"><div><p className="eyebrow"><Gamepad2 size={14} aria-hidden="true"/> {event.status === "ended" ? "WRAP-UP" : "GAMES"}</p><h2 id="event-games-title">{ownView ? "Your games" : `${player.name}’s games`}</h2></div></div>
      <dl className="event-totals"><div><dt>Score</dt><dd>{points(player.score)}</dd></div><div><dt>Games</dt><dd>{player.games}</dd></div><div><dt>Hours</dt><dd>{points(player.minutes / 60)}</dd></div>
        <div><dt>Beaten</dt><dd>{player.beaten}</dd></div><div><dt>100%</dt><dd>{player.completed}</dd></div><div><dt>Achievements</dt><dd>{totals.achievements}</dd></div></dl>
      {games.length ? <ul className="event-games">{games.map((game) => <EventGameCard key={`${game.id}-${game.minutes}-${game.beaten}-${game.completed}`} game={game} canEdit={editable(game)} busy={busy}
        onOpen={() => void openGame(game)} onAct={(body) => act({ ...body, gameId: game.id })}/>)}</ul>
        : <p className="muted">{ownView && joined && event.status === "live" ? "Play something, then press Update. Games from your connected libraries appear here." : "No games yet."}</p>}
    </section>}

    {picking && <GamePicker title="Add a game to this event" searchLabel="Search your games" source={librarySource} selectedLabel="In event"
      isSelected={(item) => ownGames.some((game) => game.libraryItemId === item.id)} onClose={() => setPicking(false)}
      emptyText={<>Your library is empty. <a href="/search">Find a game</a> to add it first.</>}
      onToggle={async (item, add) => {
        const game = ownGames.find((entry) => entry.libraryItemId === item.id);
        const result = await eventRequest(event.id, add ? { action: "add-game", libraryItemId: item.id } : { action: "remove-game", gameId: game?.id });
        if (result.event) setDetail(result.event);
      }}/>}
    {selected && <GameDetailsDialog key={selected.igdbId} game={selected} saved={copies.filter((copy) => copy.igdbId === selected.igdbId)} signedIn onClose={() => setSelected(null)}/>}
  </>;
}

function EventGameCard({ game, canEdit, busy, onOpen, onAct }: { game: EventGameView; canEdit: boolean; busy: boolean; onOpen: () => void; onAct: (body: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(hoursInput(game.minutes));
  const [beaten, setBeaten] = useState(game.beaten);
  const [completed, setCompleted] = useState(game.completed);
  const [error, setError] = useState("");
  const edited = game.minutes !== game.autoMinutes || game.beaten !== (game.autoBeaten || game.autoCompleted) || game.completed !== game.autoCompleted;

  function save() {
    const minutes = parseHours(value);
    if (minutes === null || Number.isNaN(minutes)) { setError("Enter hours as a number, such as 12.5."); return; }
    setError("");
    void onAct({ action: "edit-game", minutes, beaten: beaten || completed, completed });
  }

  return <li className="event-game">
    <button type="button" className="event-game-cover" aria-label={`View details for ${game.name}`} onClick={onOpen}>{game.coverUrl ? <img src={game.coverUrl} alt="" loading="lazy"/> : <span className="cover-fallback"><Gamepad2 size={24} aria-hidden="true"/></span>}</button>
    <div className="event-game-body">
      <button type="button" className="event-game-title" onClick={onOpen}>{game.name}</button>
      <p className="event-game-meta">{game.platformName || "Platform not set"}</p>
      <p className="event-game-stats"><span>{hours(game.minutes)}</span>{game.completed ? <span className="event-badge"><Trophy size={13} aria-hidden="true"/>100%</span> : game.beaten ? <span className="event-badge"><CircleCheck size={13} aria-hidden="true"/>Beaten</span> : null}
        {game.achievements > 0 && <span>{game.achievements} {game.achievements === 1 ? "achievement" : "achievements"}</span>}{edited && <span className="event-edited">Edited</span>}</p>
      {editing && canEdit && <form className="event-game-edit" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <label className="playtime-field"><span>Hours</span><input type="text" inputMode="decimal" value={value} maxLength={9} onChange={(event) => setValue(event.target.value)}/></label>
        <label className="event-check"><input type="checkbox" checked={beaten || completed} disabled={completed} onChange={(event) => setBeaten(event.target.checked)}/>Beaten</label>
        <label className="event-check"><input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)}/>100%</label>
        <div className="person-actions"><button type="submit" disabled={busy}>Save</button>{edited && <button type="button" className="secondary" disabled={busy} onClick={() => void onAct({ action: "reset-game" })}>Use automatic</button>}<button type="button" className="secondary" disabled={busy} onClick={() => void onAct({ action: "remove-game" })}>Remove</button></div>
        {error && <p className="playtime-error" role="alert">{error}</p>}
        {game.autoMinutes !== game.minutes && <p className="event-game-auto">Connected libraries: {hours(game.autoMinutes)}</p>}
      </form>}
    </div>
    <div className="event-game-side"><strong>{points(game.points)}</strong><span>pts</span>
      {canEdit && !editing && <button type="button" className="event-edit" aria-label={`Edit ${game.name}`} title="Edit" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true"/></button>}</div>
  </li>;
}
