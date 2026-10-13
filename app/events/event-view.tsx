"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CalendarDays, CircleCheck, Gamepad2, LoaderCircle, Lock, Medal, Plus, RefreshCw, Search, Settings, Trophy, X } from "lucide-react";
import EventResultFilter from "./event-result-filter";
import GameDetailsDialog from "../game-details-dialog";
import GamePicker, { libraryParams, pickerRequest, type PickerSource } from "../game-picker";
import PlatformFilter, { type Platform } from "../platform-filter";
import { eventGameFilters, eventGameList, eventGameSorts, type EventGameFilter, type EventGameSort } from "../../lib/event-game-view";
import { paginateLibraryGames } from "../../lib/library-view";
import { eventDays, statusLabels } from "../../lib/event-rules";
import { steamPlatformIds } from "../../lib/steam-types";
import { xboxPlatformIds } from "../../lib/xbox-types";
import { psnPlatformIds } from "../../lib/psn-types";
import { raPlatformIds } from "../../lib/ra-types";
import type { EventChange } from "../../lib/event-review";
import type { EventDetail, EventGameView } from "../../lib/events";
import type { CatalogGame, SavedGame } from "../../lib/game-types";
import type { LibraryCopy } from "../../lib/library-copies-query";
import { formatHours, hoursInput, parseHours } from "../../lib/playtime";

type Result = { changes?: EventChange[]; message?: string; event?: EventDetail | null; error?: string };
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

function matchSource(supported: number[]): PickerSource { return {
  async load({ query, platformIds }, signal) {
    const catalog = await pickerRequest<{ platforms: Platform[] }>("/api/igdb/platforms", signal, "Could not load platforms.");
    const platforms = catalog.platforms.filter((platform) => supported.includes(platform.id));
    if (query.length < 2) return { items: [], next: null, platforms };
    const params = new URLSearchParams({ q: query });
    (platformIds.length ? platformIds : supported).forEach((id) => params.append("platform", String(id)));
    const { games } = await pickerRequest<{ games: CatalogGame[] }>(`/api/igdb/search?${params}`, signal, "Could not search games.");
    return { items: games.map((game) => ({ id: game.igdbId, name: game.name, coverUrl: game.coverUrl, detail: game.platforms.join(" · ") })), next: null, platforms };
  },
}; }
const matchSources: Record<string, PickerSource> = { steam: matchSource(steamPlatformIds), xbox: matchSource(xboxPlatformIds), psn: matchSource(psnPlatformIds), ra: matchSource(raPlatformIds) };

const subscribe = () => () => {};
const points = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
const hours = (minutes: number) => formatHours(minutes);

export default function EventView({ initial }: { initial: EventDetail }) {
  const [detail, setDetail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [changes, setChanges] = useState<EventChange[] | null>(null);
  const [matching, setMatching] = useState<EventChange | null>(null);
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
  const [query, setQuery] = useState("");
  const [platformIds, setPlatformIds] = useState<number[]>([]);
  const [sort, setSort] = useState<EventGameSort>("newest");
  const [filters, setFilters] = useState<EventGameFilter[]>([]);
  const [page, setPage] = useState(1);
  const pageStatus = useRef<HTMLParagraphElement>(null);
  const player = standings.find((row) => row.userId === playerId) ?? null;
  const games = detail.games.filter((game) => game.userId === playerId);
  const platforms: Platform[] = [...new Map(games.map((game) => [game.platformId, { id: game.platformId, name: game.platformName || "Platform not set" }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const matchingGames = eventGameList(games, query, platformIds, filters, sort);
  const { items: visibleGames, page: currentPage, pageCount, first, last } = paginateLibraryGames(matchingGames, page);
  if (page !== currentPage) setPage(currentPage);
  const filtered = Boolean(query.trim() || platformIds.length || filters.length > 0);

  function clearFilters() { setQuery(""); setPlatformIds([]); setFilters([]); setPage(1); }
  function selectPlayer(id: string) { if (id === playerId) return; setPlayerId(id); setPlatformIds([]); setPage(1); }
  function changePage(next: number) {
    setPage(next);
    requestAnimationFrame(() => {
      pageStatus.current?.focus({ preventScroll: true });
      pageStatus.current?.scrollIntoView({ block: "start" });
    });
  }

  const ownGames = detail.games.filter((game) => game.userId === viewer.userId);

  async function act(body: Record<string, unknown>, progress = "") {
    setBusy(true); setWorking(progress); setError(""); setNotice("");
    try {
      const result = await eventRequest(event.id, body);
      if (!result.event) { window.location.assign(new URL("/events", window.location.origin)); return; }
      setDetail(result.event); setNotice(result.message === "Saved." ? "" : result.message ?? "");
      if (result.changes) setChanges(result.changes);
      else if (body.action === "leave") setChanges(null);
      else if (changes !== null && typeof body.gameId === "number") {
        const changed = detail.games.find((game) => game.id === body.gameId);
        setChanges(changes.filter((row) => row.key !== `${changed?.igdbId}:${changed?.platformId}`));
      }
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

  async function accept(rows: EventChange[], igdbId?: number) {
    setBusy(true); setWorking(`Accepting ${rows.length} ${rows.length === 1 ? "game" : "games"}…`); setError(""); setNotice("");
    let count = 0;
    try {
      for (let offset = 0; offset < rows.length; offset += 20) {
        const result = await eventRequest(event.id, { action: "accept-changes", changes: rows.slice(offset, offset + 20).map((row) => ({ key: row.key, signature: row.signature, ...(igdbId ? { igdbId } : {}) })) });
        if (result.event) setDetail(result.event);
        if (result.changes) setChanges(result.changes);
        count += Math.min(20, rows.length - offset);
      }
      setNotice(`Accepted ${count} ${count === 1 ? "game" : "games"}.`); setMatching(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not accept these changes.");
      const result = await fetch(`/api/events/${event.id}`).then((response) => response.json() as Promise<Result>).catch(() => null);
      if (result?.event) setDetail(result.event);
      setChanges(null);
      if (igdbId) throw failure;
    } finally { setBusy(false); setWorking(""); }
  }

  async function openGame(game: { igdbId: number; name: string; coverUrl: string | null }) {
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
      <div className="event-title-row"><h1>{event.name}</h1>{(viewer.host || (joined && event.status !== "ended")) && <div className="person-actions event-title-actions">
        {viewer.host && <a className="event-create" href={`/events/${event.id}/settings`}><Settings size={18} aria-hidden="true"/>Manage</a>}
        {joined && event.status !== "ended" && <button className="secondary" disabled={busy} onClick={() => void act({ action: "leave" })}>Leave</button>}
      </div>}</div>
      <p className="event-dates"><CalendarDays size={16} aria-hidden="true"/>{eventDays(event.startDay, event.endDay)} · {event.timeZone.replaceAll("_", " ")}</p>
      {event.description && <p className="subcopy event-description">{event.description}</p>}
      <p className="event-hosts">Hosted by {[detail.owner, ...detail.hosts].map((host) => host.name).join(", ")}</p>
    </div></div>
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
        </> : event.status === "live" ? <>
          <p>{mounted && member?.updatedAt ? `Last updated ${new Date(member.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "Update to bring in your latest play."} Update before the event ends; results lock then.</p>
          <div className="person-actions"><button disabled={busy} onClick={() => void act({ action: "update" }, "Updating from your connected libraries…")}><RefreshCw size={16} aria-hidden="true"/> Update</button></div>
        </> : <p>This event has ended. Results are final{viewer.host ? "; as a host you can still correct them" : ""}.</p>}
    </section>

    {changes !== null && joined && event.status === "live" && <section className="events-section event-review" aria-labelledby="event-review-title">
      <div className="section-title"><h2 id="event-review-title">Changes to review</h2>
        {changes.some((row) => row.igdbId !== null) && <div className="person-actions"><button disabled={busy} onClick={() => void accept(changes.filter((row) => row.igdbId !== null))}>Accept all{changes.some((row) => row.igdbId === null) ? " matched games" : ""}</button></div>}</div>
      {changes.length ? <ul className="event-games">{changes.map((change) => <li className="event-game event-change" key={change.key}>
        <button type="button" className="event-game-cover" disabled={change.igdbId === null} aria-label={`View details for ${change.name}`} onClick={() => change.igdbId !== null && void openGame({ ...change, igdbId: change.igdbId })}>
          {change.coverUrl ? <img src={change.coverUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }}/> : <span className="cover-fallback"><Gamepad2 size={24} aria-hidden="true"/></span>}</button>
        <div className="event-game-body">
          {change.igdbId === null ? <strong className="event-game-title">{change.name}</strong> : <button className="event-game-title" onClick={() => void openGame({ ...change, igdbId: change.igdbId! })}>{change.name}</button>}
          <p className="event-game-meta">{change.platformName || "Find a catalog match"}{!change.previous && " · New to event"}{!change.libraryItemId && " · Adds to library"}</p>
          <p className="event-game-stats">{change.previous ? <span>{hours(change.previous.minutes)} → {hours(change.next.minutes)} ({change.next.minutes >= change.previous.minutes ? "+" : "−"}{hours(Math.abs(change.next.minutes - change.previous.minutes))})</span> : <span>{change.timeKnown ? `${hours(change.next.minutes)} in this event` : "Time not reported"}</span>}</p>
          <p className="event-game-stats"><span>Beaten: {change.previous && change.previous.beaten !== change.next.beaten ? `${change.previous.beaten ? "Yes" : "No"} → ` : ""}{change.next.beaten ? "Yes" : "No"}</span><span>100%: {change.previous && change.previous.completed !== change.next.completed ? `${change.previous.completed ? "Yes" : "No"} → ` : ""}{change.next.completed ? "Yes" : "No"}</span></p>
          {change.next.achievements !== (change.previous?.achievements ?? 0) && <p className="event-game-meta">{change.previous?.achievements ?? 0} → {change.next.achievements} achievements / trophies</p>}
          <div className="person-actions event-change-actions"><button disabled={busy} onClick={() => change.igdbId === null ? setMatching(change) : void accept([change])}>{change.igdbId === null ? "Find match & accept" : "Accept"}</button></div>
        </div>
      </li>)}</ul> : <p className="muted" role="status">No changes waiting for acceptance.</p>}
    </section>}

    <section className="events-section" aria-labelledby="event-board-title">
      <div className="section-title"><div><p className="eyebrow"><Medal size={14} aria-hidden="true"/> LEADERBOARD</p><h2 id="event-board-title">{event.status === "ended" ? "Final standings" : "Standings"}</h2></div></div>
      {standings.length ? <table className="event-board"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Score</th><th scope="col">Beaten</th><th scope="col" className="is-wide">100%</th><th scope="col" className="is-wide">Hours</th></tr></thead>
        <tbody>{standings.map((row) => <tr key={row.userId} className={row.userId === playerId ? "is-selected" : undefined}>
          <td>{row.rank}</td>
          <th scope="row"><button type="button" className="event-player" aria-pressed={row.userId === playerId} onClick={() => selectPlayer(row.userId)}>{row.name}{row.userId === viewer.userId ? " (you)" : ""}</button></th>
          <td>{points(row.score)}</td><td>{row.beaten}</td><td className="is-wide">{row.completed}</td><td className="is-wide">{hours(row.minutes)}</td>
        </tr>)}</tbody></table> : <p className="muted">No players yet.</p>}
      <p className="event-scoring">Each hour scores {points(event.hourPoints)}. A beaten game adds {points(event.beatenPoints)} per hour{event.completedPoints ? `, and 100% adds ${points(event.completedPoints)} more` : ""}.</p>
      {detail.multipliers.length > 0 && <details className="event-rules"><summary>Platforms and games that score differently ({detail.multipliers.length})</summary><ul className="event-multiplier-list">{detail.multipliers.map((row) =>
        <li key={row.id}><strong>{row.name}</strong><span>{points(row.hourPoints)} per hour · beaten +{points(row.beatenPoints)} · 100% +{points(row.completedPoints)}</span></li>)}</ul></details>}
    </section>

    {player && <section className="events-section" aria-labelledby="event-games-title">
      <div className="section-title event-games-heading"><div><p className="eyebrow"><Gamepad2 size={14} aria-hidden="true"/> {event.status === "ended" ? "WRAP-UP" : "GAMES"}</p><h2 id="event-games-title">{ownView ? "Your games" : `${player.name}’s games`}</h2></div>
        {ownView && joined && event.status === "live" && <div className="person-actions"><button className="secondary" disabled={busy} onClick={() => setPicking(true)}><Plus size={16} aria-hidden="true"/> Add a game</button></div>}</div>
      <dl className="event-totals"><div><dt>Score</dt><dd>{points(player.score)}</dd></div><div><dt>Games</dt><dd>{player.games}</dd></div><div><dt>Hours</dt><dd>{points(player.minutes / 60)}</dd></div>
        <div><dt>Beaten</dt><dd>{player.beaten}</dd></div><div><dt>100%</dt><dd>{player.completed}</dd></div><div><dt>Achievements</dt><dd>{totals.achievements}</dd></div></dl>
      {games.length > 0 && <>
        <div className="library-tools event-game-tools">
          <label className="library-search"><span>Search event games</span><span className="library-search-field"><Search size={17} aria-hidden="true"/><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search titles" maxLength={100} autoComplete="off" spellCheck={false}/></span></label>
          <EventResultFilter selected={filters} onChange={(next) => { setFilters(next); setPage(1); }}/>
          <PlatformFilter platforms={platforms} selected={platformIds} onChange={(ids) => { setPlatformIds(ids); setPage(1); }} className="is-end event-game-control"/>
          <label className="library-sort event-game-control"><span>Sort</span><select aria-label="Sort" value={sort} onChange={(event) => { setSort(event.target.value as EventGameSort); setPage(1); }}>{eventGameSorts.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        {filtered && <div className="event-game-filters" role="group" aria-label="Active event game filters">
          <div className="event-filter-chips">
            {query.trim() && <button type="button" className="event-filter-chip" aria-label={`Remove title filter ${query.trim()}`} onClick={() => { setQuery(""); setPage(1); }}><span>Title: {query.trim()}</span><X size={14} aria-hidden="true"/></button>}
            {filters.map((filter) => { const label = eventGameFilters.find(([key]) => key === filter)?.[1]; return <button type="button" className="event-filter-chip" key={filter} aria-label={`Remove result filter ${label}`} onClick={() => { setFilters(filters.filter((selected) => selected !== filter)); setPage(1); }}><span>{label}</span><X size={14} aria-hidden="true"/></button>; })}
            {platformIds.map((id) => { const name = platforms.find((platform) => platform.id === id)?.name || "Platform not set"; return <button type="button" className="event-filter-chip" key={id} aria-label={`Remove platform filter ${name}`} onClick={() => { setPlatformIds(platformIds.filter((selectedId) => selectedId !== id)); setPage(1); }}><span>{name}</span><X size={14} aria-hidden="true"/></button>; })}
          </div>
          <button type="button" className="library-clear" onClick={clearFilters}>Clear filters</button>
        </div>}
        <p ref={pageStatus} className="library-results" role="status" tabIndex={-1}>{matchingGames.length ? `Showing ${first}–${last} of ${matchingGames.length} ${filtered ? "matching " : ""}${matchingGames.length === 1 ? "game" : "games"}` : "No matching games"}</p>
      </>}
      {matchingGames.length ? <ul className="event-games event-game-list">{visibleGames.map((game) => <EventGameRow key={game.id} game={game} canEdit={editable(game)} busy={busy}
        onOpen={() => void openGame(game)} onAct={(body) => act({ ...body, gameId: game.id })}/>)}</ul>
        : games.length ? <div className="empty-state"><div className="empty-icon"><Search size={27} aria-hidden="true"/></div><h2>No games match</h2><p>Try another title, platform, or result.</p></div>
        : <p className="muted">{ownView && joined && event.status === "live" ? "Play something, then press Update. Games from your connected libraries appear here." : "No games yet."}</p>}
      {pageCount > 1 && <nav className="library-pagination" aria-label="Event game pages"><span>Page {currentPage} of {pageCount}</span><div><button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>Next</button></div></nav>}
    </section>}

    {matching && <GamePicker title={`Find ${matching.name}`} searchLabel="Search games" initialQuery={matching.name} source={matchSources[matching.sources[0].split(":")[0]]}
      selectedLabel="Accepted" actionLabel="Accept" isSelected={() => false} onClose={() => setMatching(null)} emptyText="No games found. Try another name."
      onToggle={async (item) => { await accept([matching], item.id); }}/>}
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

function EventGameRow({ game, canEdit, busy, onOpen, onAct }: { game: EventGameView; canEdit: boolean; busy: boolean; onOpen: () => void; onAct: (body: Record<string, unknown>) => Promise<void> }) {
  const [value, setValue] = useState(hoursInput(game.minutes));
  const [savedMinutes, setSavedMinutes] = useState(game.minutes);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const clickingStage = useRef(false);
  if (savedMinutes !== game.minutes) {
    setSavedMinutes(game.minutes);
    setValue(hoursInput(game.minutes));
  }

  async function save(beaten = game.beaten, completed = game.completed) {
    if (saving.current) return;
    const minutes = parseHours(value);
    if (minutes === null || Number.isNaN(minutes)) { setError("Enter hours as a number, such as 12.5."); return; }
    setError("");
    if (minutes === game.minutes && beaten === game.beaten && completed === game.completed) return;
    saving.current = true;
    try { await onAct({ action: "edit-game", minutes, beaten: beaten || completed, completed }); }
    finally { saving.current = false; }
  }

  return <li className="event-game event-game-row">
    <button type="button" className="event-game-cover" aria-label={`View details for ${game.name}`} onClick={onOpen}>{game.coverUrl ? <img src={game.coverUrl} alt="" loading="lazy"/> : <span className="cover-fallback"><Gamepad2 size={24} aria-hidden="true"/></span>}</button>
    <div className="event-game-body">
      <button type="button" className="event-game-title" onClick={onOpen}>{game.name}</button>
      <p className="event-game-meta">{game.platformName || "Platform not set"}</p>
      {game.achievements > 0 && <p className="event-game-meta">{game.achievements} {game.achievements === 1 ? "achievement" : "achievements"}</p>}
    </div>
    {canEdit ? <form className="event-game-edit" aria-label={`Results for ${game.name} on ${game.platformName || "unspecified platform"}`} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="playtime-field"><span>Hours</span><input type="text" inputMode="decimal" value={value} maxLength={9} disabled={busy} onChange={(event) => setValue(event.target.value)} onBlur={() => {
        // A checkbox click saves the hours and stage together, rather than racing the blur write.
        if (clickingStage.current) { clickingStage.current = false; return; }
        void save();
      }}/></label>
      <label className="event-check"><input type="checkbox" onPointerDown={() => { clickingStage.current = true; }} onPointerUp={() => { clickingStage.current = false; }} checked={game.beaten || game.completed} disabled={busy || game.completed} onChange={(event) => void save(event.target.checked, game.completed)}/>Beaten</label>
      <label className="event-check"><input type="checkbox" onPointerDown={() => { clickingStage.current = true; }} onPointerUp={() => { clickingStage.current = false; }} checked={game.completed} disabled={busy} onChange={(event) => void save(game.beaten || event.target.checked, event.target.checked)}/>100%</label>
      {error && <p className="playtime-error" role="alert">{error}</p>}
    </form> : <p className="event-game-stats"><span>{hours(game.minutes)}</span>{game.completed ? <span className="event-badge"><Trophy size={13} aria-hidden="true"/>100%</span> : game.beaten ? <span className="event-badge"><CircleCheck size={13} aria-hidden="true"/>Beaten</span> : null}</p>}
    <div className="event-game-side"><strong>{points(game.points)}</strong><span>pts</span></div>
    {canEdit && <button type="button" className="event-row-remove" disabled={busy} aria-label={`Remove ${game.name} from event`} title="Remove from event" onClick={() => void onAct({ action: "remove-game" })}><X size={16} aria-hidden="true"/></button>}
  </li>;
}
