"use client";

import { useEffect, useRef, useState } from "react";
import { Gamepad2, Play, Search } from "lucide-react";
import GamePicker, { pickerRequest, type PickerSource } from "../../game-picker";
import GameDetailsDialog from "../../game-details-dialog";
import type { CatalogGame, SavedGame } from "../../../lib/game-types";
import type { XboxPreview, XboxState } from "../../../lib/xbox-types";
import { xboxPlatformIds, xboxPlatforms } from "../../../lib/xbox-types";

async function api<T>(url: string, payload?: unknown, method = payload === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error || "Could not reach Xbox settings. Please try again.");
  return body as T;
}
function date(value: number | null) { return value ? new Date(value).toLocaleString() : "Not refreshed yet"; }
function played(value: number | null) { return value ? `Played ${new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : "Last played unknown"; }
const linkMessages: Record<string, string> = {
  connected: "Xbox connected. Refresh to load your games.", cancelled: "Xbox connection cancelled.",
  failed: "Microsoft sign-in could not be completed. Please start the connection again.", expired: "Your connection request expired. Please start again while signed in.",
  unavailable: "That Xbox profile is already linked to another account, or this account already has one.",
  profile: "That Microsoft account can’t be connected yet. Check that it has an Xbox profile and isn’t restricted.",
};
const views = [["all", "All games"], ["ready", "Ready to add"], ["unresolved", "Needs a match"], ["imported", "In library"]] as const;

function XboxArtwork({ game }: { game: XboxPreview }) {
  const [failed, setFailed] = useState<string[]>([]);
  const source = [game.game?.coverUrl, game.imageUrl].find((url) => url && !failed.includes(url));
  return <div className="steam-art">{source ? <img src={source} alt="" loading="lazy" onError={() => setFailed((current) => [...current, source])}/> : <Gamepad2 aria-hidden="true"/>}</div>;
}

const xboxMatchSource: PickerSource = {
  async load({ query, platformIds }, signal) {
    const catalog = await pickerRequest<{ platforms: { id: number; name: string }[] }>("/api/igdb/platforms", signal, "Could not load platforms.");
    const platforms = catalog.platforms.filter((p) => xboxPlatformIds.includes(p.id));
    if (query.length < 2) return { items: [], next: null, platforms };
    const params = new URLSearchParams({ q: query });
    (platformIds.length ? platformIds : xboxPlatformIds).forEach((id) => params.append("platform", String(id)));
    const data = await pickerRequest<{ games: CatalogGame[] }>(`/api/igdb/search?${params}`, signal, "Could not search for games.");
    return { items: data.games.filter((game) => xboxPlatforms(game).length).map((game) => ({ id: game.igdbId, name: game.name, coverUrl: game.coverUrl,
      detail: [game.releaseYear, ...xboxPlatforms(game).map((p) => p.id === 6 ? "Windows" : p.name)].filter(Boolean).join(" · ") })), next: null, platforms };
  },
};

export default function XboxSettings() {
  const [state, setState] = useState<XboxState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [view, setView] = useState("all");
  const [detailGame, setDetailGame] = useState<CatalogGame | null>(null);
  const [copies, setCopies] = useState<SavedGame[]>([]);
  const [matching, setMatching] = useState<number | null>(null);
  // Imported count when the player chose Add all, so the finish message reports what was actually added.
  const [addingFrom, setAddingFrom] = useState<number | null>(null);
  const alive = useRef(true);
  // Bumped by every player action so a background batch that started earlier cannot overwrite what they now see.
  const epoch = useRef(0);
  const [syncing, setSyncing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Saved on the connection, so a pause survives leaving or reloading the page.
  const paused = state?.connection?.paused ?? false;

  useEffect(() => {
    let active = true;
    alive.current = true;
    const status = new URLSearchParams(window.location.search).get("link") ?? "";
    const message = linkMessages[status];
    if (message) window.history.replaceState(null, "", "/settings/xbox");
    void api<XboxState>("/api/xbox").then((data) => { if (active) { setState(data); if (message) { if (status === "connected") setNotice(message); else setError(message); } } }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; alive.current = false; };
  }, []);

  // Matching and achievement reads run in bounded background requests while the page is open; adding runs only after Add all.
  // They never disable the page. Leaving the page stops scheduling; reopening resumes saved work.
  const step = !state?.connection ? null : state.pending ? "match" : addingFrom !== null && state.ready ? "add-all" : state.configured && state.achievementsPending ? "achievements" : null;
  useEffect(() => {
    if (!state?.connection || !step || busy || syncing || searchLoading || paused || matching !== null || detailGame) return;
    const count = (data: XboxState) => step === "match" ? data.pending : step === "add-all" ? data.ready : data.achievementsPending;
    const timer = window.setTimeout(() => {
      const started = epoch.current;
      setSyncing(true);
      void api<XboxState>("/api/xbox", { action: step, syncedAt: state.connection?.syncedAt, view, page: state.page, search: activeSearch }).then((fresh) => {
        if (!alive.current || epoch.current !== started) return;
        if (count(fresh) >= count(state)) throw new Error("Xbox sync could not make progress. Please try again.");
        setState(fresh);
        if (step === "add-all" && !fresh.ready && addingFrom !== null) { setNotice(`Added ${(fresh.imported - addingFrom).toLocaleString()} games to your library.`); setAddingFrom(null); }
      }).catch((e) => { if (alive.current && epoch.current === started) { setError(e.message); void setPaused(true); } })
        .finally(() => { if (alive.current) setSyncing(false); });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state, step, busy, syncing, searchLoading, paused, matching, detailGame, view, activeSearch, addingFrom]);

  useEffect(() => {
    if (search === activeSearch || busy) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      epoch.current += 1;
      setSearchLoading(true);
      void fetch(`/api/xbox?page=0&search=${encodeURIComponent(search)}&view=${view}`, { signal: controller.signal }).then(async (response) => {
        const data = await response.json() as XboxState & { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not search Xbox games.");
        if (controller.signal.aborted) return;
        setState(data); setActiveSearch(search); setError("");
      }).catch((error) => { if (!controller.signal.aborted) setError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setSearchLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); setSearchLoading(false); };
  }, [search, activeSearch, view, busy]);

  const query = (page = state?.page ?? 0, category = view, text = activeSearch) => `/api/xbox?page=${page}&search=${encodeURIComponent(text)}&view=${category}`;
  async function load(page: number, category = view) {
    epoch.current += 1;
    setBusy(true); setError("");
    try { setState(await api<XboxState>(query(page, category))); setView(category); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load Xbox games."); }
    finally { setBusy(false); }
  }
  async function act(payload: Record<string, unknown>, message: (fresh: XboxState) => string) {
    epoch.current += 1;
    setBusy(true); setError(""); setNotice("");
    try {
      const fresh = await api<XboxState>("/api/xbox", { ...payload, view, page: state?.page ?? 0, search: activeSearch });
      setState(fresh); setMatching(null); setConfirmDisconnect(false); setConfirmRemove(false); setNotice(message(fresh));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update Xbox."); }
    finally { setBusy(false); }
  }
  async function setPaused(value: boolean) {
    epoch.current += 1;
    setState((current) => current?.connection ? { ...current, connection: { ...current.connection, paused: value } } : current);
    try { await api<XboxState>("/api/xbox", { action: "pause", paused: value }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the sync state."); }
  }
  async function connect() {
    setBusy(true); setError("");
    try { const result = await api<{ url: string }>("/api/xbox/connect", {}); window.location.assign(result.url); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not connect Xbox."); setBusy(false); }
  }
  async function togglePlaying(row: XboxPreview) {
    epoch.current += 1;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/library/${row.libraryItemId}/playing`, undefined, row.playingSince ? "DELETE" : "PUT");
      setState(await api<XboxState>(query()));
      setNotice(`${row.name} ${row.playingSince ? "removed from" : "added to"} Currently playing.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update currently playing."); }
    finally { setBusy(false); }
  }
  async function refreshCopies() {
    const [library, fresh] = await Promise.all([api<{ games: SavedGame[] }>("/api/library"), api<XboxState>(query())]);
    setCopies(library.games); setState(fresh);
  }
  async function openGame(game: CatalogGame) {
    epoch.current += 1;
    setBusy(true); setError("");
    try { const library = await api<{ games: SavedGame[] }>("/api/library"); setCopies(library.games); setDetailGame(game); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load your library."); }
    finally { setBusy(false); }
  }
  async function updateCopy(url: string, method: string, body?: unknown) {
    await api(url, body, method);
    await refreshCopies();
  }
  // Adding from the game popup links the Xbox title when it is still waiting, so its achievements follow.
  async function addPlatform(platformId: number) {
    if (!detailGame) return;
    const source = state?.games.find((row) => row.game?.igdbId === detailGame.igdbId && !row.libraryItemId && row.available);
    if (source?.game && xboxPlatforms(source.game).some((p) => p.id === platformId)) {
      await api<XboxState>("/api/xbox", { action: "add", titleId: source.titleId, platformId });
      await refreshCopies();
    } else await updateCopy("/api/library", "POST", { igdbId: detailGame.igdbId, platformId });
  }
  async function add(row: XboxPreview, playing: boolean, igdbId?: number) {
    await act({ action: "add", titleId: row.titleId, igdbId, playing }, () => playing ? `${row.name} added and marked as playing.` : `${row.name} added to your library.`);
  }

  const remaining = step === "match" ? state?.pending ?? 0 : step === "add-all" ? state?.ready ?? 0 : state?.achievementsPending ?? 0;
  // Matching and adding know their total; achievements do not, so that step shows an indeterminate bar.
  const total = state ? state.imported + state.ready + state.unresolved + state.pending : 0;
  const addTotal = state && addingFrom !== null ? state.imported - addingFrom + state.ready : 0;
  const progressMax = step === "match" ? total : step === "add-all" ? addTotal : 0;
  const progressValue = step === "match" ? total - (state?.pending ?? 0) : addTotal - (state?.ready ?? 0);
  const working = busy || searchLoading;
  const matchingRow = state?.games.find((row) => row.titleId === matching);
  return <><div className="steam-settings">
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    {!state ? <p className="muted">{error ? <button className="tool-button" onClick={() => void load(0)}>Retry</button> : "Loading Xbox connection…"}</p> : !state.connection ?
      <section className="settings-card"><h2>Connect your Xbox account</h2><p>See the games you’ve played on Xbox and PC, add them to your library, and show your achievements.</p><p>Sign in with the Microsoft account that owns your gamertag. Achievement progress for games you add appears on your profile and in your friends’ timeline, following your RGBoner profile visibility.</p><p>Your password stays with Microsoft.</p>
        {!state.configured && <p role="status">The site owner needs to configure Microsoft sign-in.</p>}
        <div className="person-actions"><button disabled={busy || !state.configured} onClick={() => void connect()}>Connect Xbox</button></div>
      </section> : <>
      <section className="steam-connection" aria-label="Connected account">
        <div><strong>{state.connection.gamertag}</strong><p>Last refreshed {date(state.connection.syncedAt)}</p></div>
        <div className="person-actions"><button className="secondary" disabled={working || !state.configured} onClick={() => void act({ action: "refresh" }, (fresh) => fresh.pending ? `Refreshed. Matching ${fresh.pending.toLocaleString()} games…` : "Refreshed. No new games to match.")}>Refresh</button>{state.imported > 0 && <button className="tool-button" disabled={working} onClick={() => { setConfirmRemove(!confirmRemove); setConfirmDisconnect(false); if (!confirmRemove) { setAddingFrom(null); void setPaused(true); } }}>Remove all games</button>}<button className="tool-button" disabled={working} onClick={() => { setConfirmDisconnect(!confirmDisconnect); setConfirmRemove(false); }}>Disconnect</button></div>
      </section>
      {state.connection.syncError && <p className="notice" role="status">{state.connection.syncError}</p>}
      {confirmRemove && <div className="steam-disconnect"><p>Remove the {state.imported.toLocaleString()} Xbox games from your library? Ratings and favorites stay; currently playing and completed marks go with the copies. They won’t be added again automatically.</p><div className="person-actions"><button disabled={busy || syncing} onClick={() => void act({ action: "remove-library" }, () => "Removed from your library.")}>Confirm remove</button><button className="secondary" onClick={() => setConfirmRemove(false)}>Cancel</button></div></div>}
      {confirmDisconnect && <div className="steam-disconnect"><p>Erase Xbox data and achievements? Games you added stay in your library.</p><div className="person-actions"><button disabled={busy} onClick={() => void act({ action: "disconnect" }, () => "Xbox disconnected. Your games were kept.")}>Confirm disconnect</button><button className="secondary" onClick={() => setConfirmDisconnect(false)}>Cancel</button></div></div>}
      <section className="steam-import" aria-labelledby="xbox-import-title">
        <div className="steam-import-heading"><div><h2 id="xbox-import-title">Xbox games</h2><p>{state.imported.toLocaleString()} in library · {state.ready.toLocaleString()} ready to add{state.unresolved ? ` · ${state.unresolved.toLocaleString()} need a match` : ""}</p></div>
          <div className="person-actions">{state.ready > 0 && addingFrom === null && <button disabled={working || Boolean(step)} onClick={() => { setAddingFrom(state.imported); if (paused) void setPaused(false); setNotice(""); setError(""); }}>Add all {state.ready.toLocaleString()}</button>}<a className="inline-link" href="/library">My library →</a></div></div>
        {step && <div className="steam-progress"><div><p role="status">{paused ? "Progress saved." : step === "match" ? "Matching games…" : step === "add-all" ? "Adding games…" : "Loading achievements…"}{!paused && ` ${remaining.toLocaleString()} left`}</p><button className="tool-button" onClick={() => { void setPaused(!paused); setError(""); }}>{paused ? "Resume" : "Pause"}</button></div>{progressMax > 0 ? <progress aria-label="Xbox sync" value={progressValue} max={progressMax}/> : <progress aria-label="Xbox sync"/>}</div>}
      </section>
      <section aria-label="Xbox games">
        <div className="steam-toolbar"><div className="steam-filters" role="group" aria-label="Filter Xbox games">{views.map(([id, label]) => <button className="secondary" key={id} aria-pressed={view === id} disabled={working} onClick={() => void load(0, id)}>{label}</button>)}</div>
          <label className="library-search steam-library-search"><span className="sr-only">Search your Xbox games</span><span className="library-search-field"><Search size={17} aria-hidden="true"/><input type="search" placeholder="Search titles" value={search} maxLength={100} autoComplete="off" spellCheck={false} disabled={working} onChange={(event) => setSearch(event.target.value)}/></span></label>
        </div>
        <p className="steam-count">{state.total ? `${state.page * 30 + 1}–${Math.min((state.page + 1) * 30, state.total)} of ${state.total.toLocaleString()} games, most recently played first` : view === "unresolved" ? "All clear. Every game has a match." : "No games here yet. Refresh or change the filters."}</p>
        <div className="steam-grid" aria-busy={searchLoading}>{state.games.map((row) => {
          const options = row.game ? xboxPlatforms(row.game) : [];
          const canAdd = !row.libraryItemId && row.available && options.length > 0;
          const status = row.libraryItemId ? row.playingSince ? "Playing" : "In your library" : !row.available ? "Not in latest refresh" : options.length ? "Ready to add" : row.matchedAt ? row.game ? "No Xbox or PC platform" : "No match" : "Matching…";
          return <article className="steam-game" key={row.titleId}>
            <button className="steam-game-open" disabled={working} aria-label={`Open ${row.name}`} onClick={() => row.game ? void openGame(row.game) : setMatching(row.titleId)}>
              <XboxArtwork game={row}/>
              <div className="steam-game-body"><span className={`steam-badge${row.libraryItemId || canAdd ? " is-matched" : ""}`}>{status}</span><h3 title={row.name}>{row.name}</h3>
                <p>{row.totalAchievements ? `${row.currentAchievements}/${row.totalAchievements} · ${row.currentGamerscore.toLocaleString()}G` : "No achievements"}</p><p>{played(row.lastPlayedAt)}</p></div>
            </button>
            <div className="steam-card-actions">
              {row.libraryItemId ? <button className="secondary" aria-pressed={Boolean(row.playingSince)} disabled={working} onClick={() => void togglePlaying(row)}><Play size={15} fill={row.playingSince ? "currentColor" : "none"} aria-hidden="true"/> Playing<span className="sr-only"> {row.name}</span></button>
                : canAdd ? <><button disabled={working} onClick={() => void add(row, false)}>Add<span className="sr-only"> {row.name}</span></button><button className="secondary" disabled={working} onClick={() => void add(row, true)}>Add as playing<span className="sr-only"> {row.name}</span></button></>
                : row.available && row.matchedAt && <button className="secondary" disabled={working} onClick={() => setMatching(row.titleId)}>Find match<span className="sr-only"> for {row.name}</span></button>}
              {canAdd && <button className="tool-button" disabled={working} onClick={() => setMatching(row.titleId)}>Change match<span className="sr-only"> for {row.name}</span></button>}
            </div>
          </article>;
        })}</div>
        <div className="steam-footer"><div className="person-actions"><button className="secondary" disabled={working || state.page === 0} onClick={() => void load(state.page - 1)}>Previous</button><button className="secondary" disabled={working || (state.page + 1) * 30 >= state.total} onClick={() => void load(state.page + 1)}>Next</button></div></div>
      </section>
    </>}
  </div>
    {detailGame && <GameDetailsDialog key={detailGame.igdbId} game={detailGame} saved={copies.filter((copy) => copy.igdbId === detailGame.igdbId)} signedIn onClose={() => setDetailGame(null)}
      onAdd={addPlatform}
      onRemove={(id) => updateCopy(`/api/library/${id}`, "DELETE")}
      onPlaying={(id, playing) => updateCopy(`/api/library/${id}/playing`, playing ? "PUT" : "DELETE")}/>}
    {matchingRow && <GamePicker title="Find the matching game" description={`Xbox: ${matchingRow.name}`} searchLabel="Search games…" initialQuery={matchingRow.name.replace(/[™®©]/g, "").slice(0, 100)} source={xboxMatchSource} actionLabel="Add" selectedLabel="Added" isSelected={() => false}
      emptyText="Search for the matching game on IGDB." onClose={() => setMatching(null)} onToggle={async (item) => {
        const fresh = await api<XboxState>("/api/xbox", { action: "add", titleId: matchingRow.titleId, igdbId: item.id, view, page: state?.page ?? 0, search: activeSearch });
        setState(fresh); setMatching(null); setNotice(`${matchingRow.name} added to your library.`);
      }}/>}
  </>;
}
