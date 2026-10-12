"use client";

import { useEffect, useRef, useState } from "react";
import { Gamepad2, Play, Search } from "lucide-react";
import GamePicker, { pickerRequest, type PickerSource } from "../../game-picker";
import GameDetailsDialog from "../../game-details-dialog";
import type { CatalogGame, SavedGame } from "../../../lib/game-types";
import { formatPlaytime } from "../../../lib/psn-types";
import type { RaLink, RaPreview, RaState } from "../../../lib/ra-types";
import { raPlatformIds, raPlatforms } from "../../../lib/ra-types";

async function api<T>(url: string, payload?: unknown, method = payload === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error || "Could not reach RetroAchievements settings. Please try again.");
  return body as T;
}
function date(value: number | null) { return value ? new Date(value).toLocaleString() : "Not refreshed yet"; }
function played(value: number | null) { return value ? `Played ${new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : "Last played unknown"; }
const views = [["all", "All games"], ["ready", "Ready to add"], ["unresolved", "Needs a match"], ["imported", "In library"]] as const;

function RaArtwork({ game }: { game: RaPreview }) {
  const [failed, setFailed] = useState<string[]>([]);
  const source = [game.game?.coverUrl, game.imageUrl].find((url) => url && !failed.includes(url));
  return <div className="steam-art">{source ? <img src={source} alt="" loading="lazy" onError={() => setFailed((current) => [...current, source])}/> : <Gamepad2 aria-hidden="true"/>}</div>;
}

const raMatchSource: PickerSource = {
  async load({ query, platformIds }, signal) {
    const catalog = await pickerRequest<{ platforms: { id: number; name: string }[] }>("/api/igdb/platforms", signal, "Could not load platforms.");
    const platforms = catalog.platforms.filter((p) => raPlatformIds.includes(p.id));
    if (query.length < 2) return { items: [], next: null, platforms };
    const params = new URLSearchParams({ q: query });
    (platformIds.length ? platformIds : raPlatformIds).forEach((id) => params.append("platform", String(id)));
    const data = await pickerRequest<{ games: CatalogGame[] }>(`/api/igdb/search?${params}`, signal, "Could not search for games.");
    return { items: data.games.filter((game) => raPlatforms(game).length).map((game) => ({ id: game.igdbId, name: game.name, coverUrl: game.coverUrl,
      detail: [game.releaseYear, ...raPlatforms(game).map((p) => p.name)].filter(Boolean).join(" · ") })), next: null, platforms };
  },
};

// RetroAchievements has no sign-in for other sites yet, so the player proves the account is theirs with a short code in their RA motto.
function UsernameForm({ busy, onSubmit }: { busy: boolean; onSubmit: (username: string) => void }) {
  const [username, setUsername] = useState("");
  return <form className="psn-connect" onSubmit={(event) => { event.preventDefault(); onSubmit(username.trim()); }}>
    <label className="field">RetroAchievements username<input value={username} maxLength={32} autoComplete="off" spellCheck={false} required onChange={(event) => setUsername(event.target.value)}/></label>
    <div className="person-actions"><button type="submit" disabled={busy || username.trim().length < 2}>Get code</button></div>
  </form>;
}

function CodeStep({ link, busy, onVerify, onCancel }: { link: RaLink; busy: boolean; onVerify: () => void; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);
  return <div className="psn-connect ra-link">
    <ol>
      <li>Copy your code: <code className="ra-code">{link.code}</code> <button type="button" className="tool-button" onClick={() => void navigator.clipboard?.writeText(link.code).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button></li>
      <li>Paste it into your motto in <a className="inline-link" href="https://retroachievements.org/controlpanel.php" target="_blank" rel="noreferrer">RetroAchievements settings</a> as {link.username}, and save.</li>
      <li>Come back and verify. You can remove the code afterwards.</li>
    </ol>
    <p className="muted">The code expires at {new Date(link.expiresAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}. RGBoner only reads public RetroAchievements data; it never asks for your password.</p>
    <div className="person-actions"><button type="button" disabled={busy} onClick={onVerify}>Verify</button><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Use a different username</button></div>
  </div>;
}

export default function RaSettings() {
  const [state, setState] = useState<RaState | null>(null);
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
    void api<RaState>("/api/ra").then((data) => { if (active) setState(data); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; alive.current = false; };
  }, []);

  // Matching and achievement reads run in bounded background requests while the page is open; adding runs only after Add all.
  // They never disable the page. Leaving the page stops scheduling; reopening resumes saved work.
  const step = !state?.connection ? null : state.pending ? "match" : addingFrom !== null && state.ready ? "add-all" : state.configured && state.achievementsPending ? "achievements" : null;
  useEffect(() => {
    if (!state?.connection || !step || busy || syncing || searchLoading || paused || matching !== null || detailGame) return;
    const count = (data: RaState) => step === "match" ? data.pending : step === "add-all" ? data.ready : data.achievementsPending;
    const timer = window.setTimeout(() => {
      const started = epoch.current;
      setSyncing(true);
      void api<RaState>("/api/ra", { action: step, syncedAt: state.connection?.syncedAt, view, page: state.page, search: activeSearch }).then((fresh) => {
        if (!alive.current || epoch.current !== started) return;
        if (count(fresh) >= count(state)) throw new Error("RetroAchievements sync could not make progress. Please try again.");
        setState(fresh);
        if (step === "add-all" && !fresh.ready && addingFrom !== null) { setNotice(`Added ${(fresh.imported - addingFrom).toLocaleString()} games to your library.`); setAddingFrom(null); }
      }).catch(async (e) => {
        if (!alive.current || epoch.current !== started) return;
        setError(e.message);
        await setPaused(true);
      })
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
      void fetch(`/api/ra?page=0&search=${encodeURIComponent(search)}&view=${view}`, { signal: controller.signal }).then(async (response) => {
        const data = await response.json() as RaState & { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not search RetroAchievements games.");
        if (controller.signal.aborted) return;
        setState(data); setActiveSearch(search); setError("");
      }).catch((error) => { if (!controller.signal.aborted) setError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setSearchLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); setSearchLoading(false); };
  }, [search, activeSearch, view, busy]);

  const query = (page = state?.page ?? 0, category = view, text = activeSearch) => `/api/ra?page=${page}&search=${encodeURIComponent(text)}&view=${category}`;
  async function load(page: number, category = view) {
    epoch.current += 1;
    setBusy(true); setError("");
    try { setState(await api<RaState>(query(page, category))); setView(category); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load RetroAchievements games."); }
    finally { setBusy(false); }
  }
  async function act(payload: Record<string, unknown>, message: (fresh: RaState) => string) {
    epoch.current += 1;
    setBusy(true); setError(""); setNotice("");
    try {
      const fresh = await api<RaState>("/api/ra", { ...payload, view, page: state?.page ?? 0, search: activeSearch });
      setState(fresh); setMatching(null); setConfirmDisconnect(false); setConfirmRemove(false); setNotice(message(fresh));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update RetroAchievements."); }
    finally { setBusy(false); }
  }
  async function setPaused(value: boolean) {
    epoch.current += 1;
    setState((current) => current?.connection ? { ...current, connection: { ...current.connection, paused: value } } : current);
    try { await api<RaState>("/api/ra", { action: "pause", paused: value }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the sync state."); }
  }
  async function link(payload: Record<string, unknown>, message: string) {
    epoch.current += 1;
    setBusy(true); setError(""); setNotice("");
    try { setState(await api<RaState>("/api/ra/connect", payload)); setNotice(message); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not connect RetroAchievements."); }
    finally { setBusy(false); }
  }
  async function togglePlaying(row: RaPreview) {
    epoch.current += 1;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/library/${row.libraryItemId}/playing`, undefined, row.playingSince ? "DELETE" : "PUT");
      setState(await api<RaState>(query()));
      setNotice(`${row.name} ${row.playingSince ? "removed from" : "added to"} Currently playing.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update currently playing."); }
    finally { setBusy(false); }
  }
  async function refreshCopies() {
    const [library, fresh] = await Promise.all([api<{ games: SavedGame[] }>("/api/library"), api<RaState>(query())]);
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
  // Adding from the game popup links the RetroAchievements game when it is still waiting, so its achievements follow.
  async function addPlatform(platformId: number) {
    if (!detailGame) return;
    const source = state?.games.find((row) => row.game?.igdbId === detailGame.igdbId && !row.libraryItemId && row.available);
    if (source?.game && raPlatforms(source.game).some((p) => p.id === platformId)) {
      await api<RaState>("/api/ra", { action: "add", gameId: source.gameId, platformId });
      await refreshCopies();
    } else await updateCopy("/api/library", "POST", { igdbId: detailGame.igdbId, platformId });
  }
  async function add(row: RaPreview, playing: boolean, igdbId?: number) {
    await act({ action: "add", gameId: row.gameId, igdbId, playing }, () => playing ? `${row.name} added and marked as playing.` : `${row.name} added to your library.`);
  }

  const remaining = step === "match" ? state?.pending ?? 0 : step === "add-all" ? state?.ready ?? 0 : state?.achievementsPending ?? 0;
  // Matching and adding know their total; achievements do not, so that step shows an indeterminate bar.
  const total = state ? state.imported + state.ready + state.unresolved + state.pending : 0;
  const addTotal = state && addingFrom !== null ? state.imported - addingFrom + state.ready : 0;
  const progressMax = step === "match" ? total : step === "add-all" ? addTotal : 0;
  const progressValue = step === "match" ? total - (state?.pending ?? 0) : addTotal - (state?.ready ?? 0);
  const working = busy || searchLoading;
  const matchingRow = state?.games.find((row) => row.gameId === matching);
  return <><div className="steam-settings">
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    {!state ? <p className="muted">{error ? <button className="tool-button" onClick={() => void load(0)}>Retry</button> : "Loading RetroAchievements connection…"}</p> : !state.connection ?
      <section className="settings-card"><h2>Connect your RetroAchievements account</h2><p>See the retro games you’ve earned achievements in, add them to your library, and show the games you’ve beaten.</p>
        {!state.configured ? <p role="status">The site owner needs to configure RetroAchievements.</p>
          : state.link ? <CodeStep link={state.link} busy={busy} onVerify={() => void link({ action: "verify" }, "RetroAchievements connected. You can remove the code from your motto. Refresh to load your games.")} onCancel={() => void link({ action: "cancel" }, "")}/>
          : <UsernameForm busy={busy} onSubmit={(username) => void link({ action: "start", username }, "")}/>}
      </section> : <>
      <section className="steam-connection" aria-label="Connected account">
        <div><strong>{state.connection.username}</strong><p>Last refreshed {date(state.connection.syncedAt)}</p></div>
        <div className="person-actions"><button className="secondary" disabled={working || !state.configured} onClick={() => void act({ action: "refresh" }, (fresh) => fresh.pending ? `Refreshed. Matching ${fresh.pending.toLocaleString()} games…` : "Refreshed. No new games to match.")}>Refresh</button>{state.imported > 0 && <button className="tool-button" disabled={working} onClick={() => { setConfirmRemove(!confirmRemove); setConfirmDisconnect(false); if (!confirmRemove) { setAddingFrom(null); void setPaused(true); } }}>Remove all games</button>}<button className="tool-button" disabled={working} onClick={() => { setConfirmDisconnect(!confirmDisconnect); setConfirmRemove(false); }}>Disconnect</button></div>
      </section>
      {state.connection.syncError && <p className="notice" role="status">{state.connection.syncError}</p>}
      {confirmRemove && <div className="steam-disconnect"><p>Remove the {state.imported.toLocaleString()} RetroAchievements games from your library? Ratings and favorites stay; currently playing and completed marks go with the copies. They won’t be added again automatically.</p><div className="person-actions"><button disabled={busy || syncing} onClick={() => void act({ action: "remove-library" }, () => "Removed from your library.")}>Confirm remove</button><button className="secondary" onClick={() => setConfirmRemove(false)}>Cancel</button></div></div>}
      {confirmDisconnect && <div className="steam-disconnect"><p>Erase RetroAchievements data and achievements? Games you added stay in your library.</p><div className="person-actions"><button disabled={busy} onClick={() => void act({ action: "disconnect" }, () => "RetroAchievements disconnected. Your games were kept.")}>Confirm disconnect</button><button className="secondary" onClick={() => setConfirmDisconnect(false)}>Cancel</button></div></div>}
      <section className="steam-import" aria-labelledby="ra-import-title">
        <div className="steam-import-heading"><div><h2 id="ra-import-title">RetroAchievements games</h2><p>{state.imported.toLocaleString()} in library · {state.ready.toLocaleString()} ready to add{state.unresolved ? ` · ${state.unresolved.toLocaleString()} need a match` : ""}</p></div>
          <div className="person-actions">{state.ready > 0 && addingFrom === null && <button disabled={working || Boolean(step)} onClick={() => { setAddingFrom(state.imported); if (paused) void setPaused(false); setNotice(""); setError(""); }}>Add all {state.ready.toLocaleString()}</button>}<a className="inline-link" href="/library">My library →</a></div></div>
        {step && <div className="steam-progress"><div><p role="status">{paused ? "Progress saved." : step === "match" ? "Matching games…" : step === "add-all" ? "Adding games…" : "Loading achievements…"}{!paused && ` ${remaining.toLocaleString()} left`}</p><button className="tool-button" onClick={() => { void setPaused(!paused); setError(""); }}>{paused ? "Resume" : "Pause"}</button></div>{progressMax > 0 ? <progress aria-label="RetroAchievements sync" value={progressValue} max={progressMax}/> : <progress aria-label="RetroAchievements sync"/>}</div>}
      </section>
      <section aria-label="RetroAchievements games">
        <div className="steam-toolbar"><div className="steam-filters" role="group" aria-label="Filter RetroAchievements games">{views.map(([id, label]) => <button className="secondary" key={id} aria-pressed={view === id} disabled={working} onClick={() => void load(0, id)}>{label}</button>)}</div>
          <label className="library-search steam-library-search"><span className="sr-only">Search your RetroAchievements games</span><span className="library-search-field"><Search size={17} aria-hidden="true"/><input type="search" placeholder="Search titles" value={search} maxLength={100} autoComplete="off" spellCheck={false} disabled={working} onChange={(event) => setSearch(event.target.value)}/></span></label>
        </div>
        <p className="steam-count">{state.total ? `${state.page * 30 + 1}–${Math.min((state.page + 1) * 30, state.total)} of ${state.total.toLocaleString()} games, most recently played first` : view === "unresolved" ? "All clear. Every game has a match." : "No games here yet. Refresh or change the filters."}</p>
        <div className="steam-grid" aria-busy={searchLoading}>{state.games.map((row) => {
          const options = row.game ? raPlatforms(row.game) : [];
          const canAdd = !row.libraryItemId && row.available && options.length > 0;
          const status = row.libraryItemId ? row.playingSince ? "Playing" : "In your library" : !row.available ? "Not in latest refresh" : options.length ? "Ready to add" : row.matchedAt ? row.game ? "No supported platform" : "No match" : "Matching…";
          return <article className="steam-game" key={row.gameId}>
            <button className="steam-game-open" disabled={working} aria-label={`Open ${row.name}`} onClick={() => row.game ? void openGame(row.game) : setMatching(row.gameId)}>
              <RaArtwork game={row}/>
              <div className="steam-game-body"><span className={`steam-badge${row.libraryItemId || canAdd ? " is-matched" : ""}`}>{status}</span><h3 title={row.name}>{row.name}</h3>
                <p>{[row.consoleName, `${row.earned}/${row.total} achievements`, row.completedAt ? row.completedHardcore ? "Beaten · Hardcore" : "Beaten" : null].filter(Boolean).join(" · ")}</p><p>{[played(row.lastPlayedAt), formatPlaytime(row.playSeconds)].filter(Boolean).join(" · ")}</p></div>
            </button>
            <div className="steam-card-actions">
              {row.libraryItemId ? <button className="secondary" aria-pressed={Boolean(row.playingSince)} disabled={working} onClick={() => void togglePlaying(row)}><Play size={15} fill={row.playingSince ? "currentColor" : "none"} aria-hidden="true"/> Playing<span className="sr-only"> {row.name}</span></button>
                : canAdd ? <><button disabled={working} onClick={() => void add(row, false)}>Add<span className="sr-only"> {row.name}</span></button><button className="secondary" disabled={working} onClick={() => void add(row, true)}>Add as playing<span className="sr-only"> {row.name}</span></button></>
                : row.available && row.matchedAt && <button className="secondary" disabled={working} onClick={() => setMatching(row.gameId)}>Find match<span className="sr-only"> for {row.name}</span></button>}
              {canAdd && <button className="tool-button" disabled={working} onClick={() => setMatching(row.gameId)}>Change match<span className="sr-only"> for {row.name}</span></button>}
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
    {matchingRow && <GamePicker title="Find the matching game" description={`RetroAchievements: ${matchingRow.name}`} searchLabel="Search games…" initialQuery={matchingRow.name.replace(/^(~[^~]+~\s*)+/, "").slice(0, 100)} source={raMatchSource} actionLabel="Add" selectedLabel="Added" isSelected={() => false}
      emptyText="Search for the matching game on IGDB." onClose={() => setMatching(null)} onToggle={async (item) => {
        const fresh = await api<RaState>("/api/ra", { action: "add", gameId: matchingRow.gameId, igdbId: item.id, view, page: state?.page ?? 0, search: activeSearch });
        setState(fresh); setMatching(null); setNotice(`${matchingRow.name} added to your library.`);
      }}/>}
  </>;
}
