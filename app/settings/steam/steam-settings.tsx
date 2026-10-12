"use client";

import { useEffect, useRef, useState } from "react";
import { Gamepad2, Search } from "lucide-react";
import GamePicker, { pickerRequest, type PickerSource } from "../../game-picker";
import GameDetailsDialog from "../../game-details-dialog";
import type { CatalogGame, SavedGame } from "../../../lib/game-types";
import type { SteamState } from "../../../lib/steam-types";
import { steamPlatforms, steamPlatformIds } from "../../../lib/steam-types";

async function api<T>(url: string, payload?: unknown): Promise<T> {
  const response = await fetch(url, payload === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error || "Could not reach Steam settings. Please try again.");
  return body as T;
}
function hours(minutes: number | null) { return minutes === null ? "Playtime unavailable" : `${(minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} hours`; }
function totalPlaytime(minutes: number | null) { return minutes === null ? "Total playtime unavailable" : `${hours(minutes)} total`; }
function date(value: number | null) { return value ? new Date(value).toLocaleString() : "Not refreshed yet"; }
const linkMessages: Record<string, string> = {
  connected: "Steam connected. Refresh your library to start an import.", cancelled: "Steam connection cancelled.",
  failed: "Steam could not be verified. Please start the connection again.", expired: "Your connection request expired. Please start again while signed in.",
  unavailable: "That Steam account could not be linked. Disconnect any existing link before trying again.",
};

function SteamArtwork({ appId, coverUrl }: { appId?: number; coverUrl?: string | null }) {
  const [failed, setFailed] = useState<string[]>([]);
  const sources = [coverUrl, ...(appId ? [`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`, `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`] : [])];
  const source = sources.find((url) => url && !failed.includes(url));
  return <div className="steam-art">{source ? <img src={source} alt="" loading="lazy" onError={() => setFailed((current) => [...current, source])}/> : <Gamepad2 aria-hidden="true"/>}</div>;
}

const steamMatchSource: PickerSource = {
  async load({ query, platformIds }, signal) {
    const catalog = await pickerRequest<{ platforms: { id: number; name: string }[] }>("/api/igdb/platforms", signal, "Could not load platforms.");
    const platforms = catalog.platforms.filter((p) => steamPlatformIds.includes(p.id));
    if (query.length < 2) return { items: [], next: null, platforms };
    const params = new URLSearchParams({ q: query });
    (platformIds.length ? platformIds : steamPlatformIds).forEach((id) => params.append("platform", String(id)));
    const data = await pickerRequest<{ games: CatalogGame[] }>(`/api/igdb/search?${params}`, signal, "Could not search for games.");
    return { items: data.games.filter((game) => steamPlatforms(game).length).map((game) => ({ id: game.igdbId, name: game.name, coverUrl: game.coverUrl,
      detail: [game.releaseYear, ...steamPlatforms(game).map((p) => p.id === 6 ? "Windows" : p.name)].filter(Boolean).join(" · ") })), next: null, platforms };
  },
};

export default function SteamSettings() {
  const [state, setState] = useState<SteamState | null>(null);
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
  const [processing, setProcessing] = useState<"matching" | "importing" | null>(null);
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
    if (message) window.history.replaceState(null, "", "/settings/steam");
    void api<SteamState>("/api/steam").then((data) => { if (active) { setState(data); if (message) { if (status === "connected") setNotice(message); else setError(message); } } }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; alive.current = false; };
  }, []);

  // Sync only matches games, in bounded sequential requests. Adding them to the library is the player's Import all games action.
  // Batches never disable the page. Leaving the page stops scheduling; reopening resumes persisted work automatically.
  useEffect(() => {
    if (!state?.connection || !state.pending || busy || syncing || searchLoading || paused || matching !== null || detailGame) return;
    const timer = window.setTimeout(() => {
      const started = epoch.current;
      setSyncing(true); setProcessing("matching");
      void api<SteamState>("/api/steam", { action: "match", view, page: state.page, search: activeSearch }).then((fresh) => {
        if (!alive.current || epoch.current !== started) return;
        if (fresh.pending >= state.pending) throw new Error("Steam sync could not make progress. Please try again.");
        setState(fresh);
        if (!fresh.pending) setNotice(fresh.ready ? `Steam library synced. ${fresh.ready.toLocaleString()} games ready to add.` : "Steam library synced.");
      }).catch((e) => { if (alive.current && epoch.current === started) { setError(e.message); void setPaused(true); } })
        .finally(() => { if (alive.current) { setSyncing(false); setProcessing(null); } });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state?.pending, state?.connection, state?.page, busy, syncing, searchLoading, paused, matching, detailGame, view, activeSearch]);

  useEffect(() => {
    if (search === activeSearch || busy) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      epoch.current += 1;
      setSearchLoading(true);
      void fetch(`/api/steam?page=0&search=${encodeURIComponent(search)}&view=${view}`, { signal: controller.signal }).then(async (response) => {
        const data = await response.json() as SteamState & { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not search Steam games.");
        if (controller.signal.aborted) return;
        setState(data); setActiveSearch(search); setError("");
      }).catch((error) => { if (!controller.signal.aborted) setError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setSearchLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); setSearchLoading(false); };
  }, [search, activeSearch, view, busy]);

  async function load(page: number, query = activeSearch, category = view) {
    epoch.current += 1;
    setBusy(true); setError("");
    try { setState(await api<SteamState>(`/api/steam?page=${page}&search=${encodeURIComponent(query)}&view=${category}`)); setView(category); setMatching(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load Steam games."); }
    finally { setBusy(false); }
  }
  async function act(payload: unknown, message: string) {
    epoch.current += 1;
    setBusy(true); setError(""); setNotice("");
    try {
      const fresh = await api<SteamState>("/api/steam", payload);
      setState(fresh); setView("all"); setSearch(""); setActiveSearch(""); setMatching(null); setConfirmDisconnect(false); setConfirmRemove(false); setNotice((payload as { action?: string }).action === "refresh" ? fresh.pending ? `Library refreshed. Matching ${fresh.pending.toLocaleString()} pending games…` : "Library refreshed. No new games to match." : message);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update Steam."); }
    finally { setBusy(false); }
  }
  async function setPaused(value: boolean) {
    epoch.current += 1;
    setState((current) => current?.connection ? { ...current, connection: { ...current.connection, paused: value } } : current);
    try { await api<SteamState>("/api/steam", { action: "pause", paused: value }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the sync state."); }
  }
  async function importAll() {
    if (!state?.connection) return;
    epoch.current += 1;
    setBusy(true); setError(""); setNotice(""); setProcessing("importing");
    const { steamId, syncedAt } = state.connection;
    const start = state.ready;
    let current = state;
    try {
      while (alive.current && current.ready > 0) {
        const fresh = await api<SteamState>("/api/steam", { action: "import-matched", steamId, syncedAt, view, page: current.page, search: activeSearch });
        if (fresh.ready >= current.ready) throw new Error("Could not add every game. Please try again.");
        current = fresh; setState(fresh);
      }
      if (alive.current) setNotice(`Added ${start.toLocaleString()} games to your library.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add games to your library."); }
    finally { if (alive.current) { setBusy(false); setProcessing(null); } }
  }
  async function connect() {
    setBusy(true); setError("");
    try { const result = await api<{ url: string }>("/api/steam/connect", {}); window.location.assign(result.url); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not connect Steam."); setBusy(false); }
  }
  async function refreshCopies() {
    const [library, fresh] = await Promise.all([
      api<{ games: SavedGame[] }>("/api/library"),
      api<SteamState>(`/api/steam?page=${state?.page ?? 0}&view=${view}&search=${encodeURIComponent(activeSearch)}`),
    ]);
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
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "Could not update your library.");
    await refreshCopies();
  }
  async function addPlatform(platformId: number) {
    if (!detailGame) return;
    const source = state?.games.find((row) => row.game?.igdbId === detailGame.igdbId && !row.libraryItemId && row.available && !row.ignored);
    if (source?.game && steamPlatforms(source.game).some((p) => p.id === platformId)) {
      await api<SteamState>("/api/steam", { action: "import", selections: [{ appId: source.appId, platformId }] });
      await refreshCopies();
    } else await updateCopy("/api/library", "POST", { igdbId: detailGame.igdbId, platformId });
  }
  async function resolve(appId: number, igdbId?: number) {
    epoch.current += 1;
    setBusy(true); setError("");
    try {
      const fresh = await api<SteamState>("/api/steam", { action: "resolve", appId, igdbId, view, page: state?.page ?? 0, search: activeSearch });
      setState(fresh); setMatching(null); setNotice("Added to your library.");
    } finally { setBusy(false); }
  }
  const working = busy || searchLoading;
  return <><div className="steam-settings">
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    {!state ? <p className="muted">{error ? <button className="tool-button" onClick={() => void load(0)}>Retry</button> : "Loading Steam connection…"}</p> : !state.connection ?
      <section className="settings-card"><h2>Connect your Steam account</h2><p>Bring your collection over in one go. We’ll find the catalog matches automatically.</p><p>Steam Game details must be public. Playtime can be hidden separately. Your import preview and recent activity are private; imported games follow your RGBoner profile visibility.</p><p>Your password stays with Steam.</p>
        {!state.configured && <p role="status">The site owner needs to configure Steam access.</p>}
        <div className="person-actions"><button disabled={busy || !state.configured} onClick={() => void connect()}>Connect Steam</button></div>
      </section> : <>
      <section className="steam-connection" aria-label="Connected account">
        <div><a className="inline-link" href={`https://steamcommunity.com/profiles/${state.connection.steamId}/`} target="_blank" rel="noreferrer">Steam connected ↗</a><p>Last refreshed {date(state.connection.syncedAt)}</p></div>
        <div className="person-actions"><button className="secondary" disabled={working || !state.configured} onClick={() => void act({ action: "refresh" }, "Library refreshed.")}>Refresh library</button>{state.imported > 0 && <button className="tool-button" disabled={working} onClick={() => { setConfirmRemove(!confirmRemove); setConfirmDisconnect(false); if (!confirmRemove) void setPaused(true); }}>Remove all games</button>}<button className="tool-button" disabled={working} onClick={() => { setConfirmDisconnect(!confirmDisconnect); setConfirmRemove(false); }}>Disconnect</button></div>
      </section>
      {state.connection.syncError && <p className="notice" role="status">{state.connection.syncError}</p>}
      {confirmRemove && <div className="steam-disconnect"><p>Remove the {state.imported.toLocaleString()} Steam games from your library? Ratings and favorites stay; currently playing and completed marks go with the copies. They won’t be added again automatically.</p><div className="person-actions"><button disabled={busy || syncing} onClick={() => void act({ action: "remove-library" }, "Removed from your library.")}>Confirm remove</button><button className="secondary" onClick={() => setConfirmRemove(false)}>Cancel</button></div></div>}
      {confirmDisconnect && <div className="steam-disconnect"><p>Erase Steam sync data? Imported games, ratings, and progress stay in RGBoner.</p><div className="person-actions"><button disabled={busy} onClick={() => void act({ action: "disconnect" }, "Steam disconnected. Imported games kept.")}>Confirm disconnect</button><button className="secondary" onClick={() => setConfirmDisconnect(false)}>Cancel</button></div></div>}
      <section className="steam-import" aria-labelledby="steam-import-title">
        <div className="steam-import-heading"><div><h2 id="steam-import-title">{state.pending ? paused ? "Steam sync paused" : "Syncing Steam library" : "Steam library"}</h2><p>{state.imported.toLocaleString()} imported{state.review ? ` · ${state.review.toLocaleString()} unresolved` : ""}</p></div><a className="inline-link" href="/library">My library →</a></div>
        {state.pending > 0 && <div className="steam-progress"><div><p role="status">{paused ? "Progress saved." : `Matching games… ${state.pending.toLocaleString()} left`}</p><button className="tool-button" onClick={() => { void setPaused(!paused); setError(""); }}>{paused ? "Resume sync" : "Pause sync"}</button></div><progress aria-label="Steam sync" value={state.imported + state.review + state.ready} max={state.pending + state.ready + state.imported + state.review}/></div>}
        {!state.pending && state.ready > 0 && <div className="steam-progress"><div><p role="status">{processing === "importing" ? `Adding games… ${state.ready.toLocaleString()} left` : `${state.ready.toLocaleString()} games ready to add`}</p><button disabled={working} onClick={() => void importAll()}>Import all games</button></div></div>}

      </section>
      <section aria-label="Steam games">
        <div className="steam-toolbar"><div className="steam-filters" role="group" aria-label="Filter Steam games">{[["all", "All games"], ["review", "Unresolved"], ["imported", "Imported"], ["updated", "Recently updated"]].map(([id, label]) => <button className="secondary" key={id} aria-pressed={view === id} disabled={working} onClick={() => void load(0, activeSearch, id)}>{label}</button>)}</div>
          <label className="library-search steam-library-search"><span className="sr-only">Search your Steam games</span><span className="library-search-field"><Search size={17} aria-hidden="true"/><input type="search" placeholder="Search titles" value={search} maxLength={100} autoComplete="off" spellCheck={false} disabled={busy} onChange={(event) => setSearch(event.target.value)}/></span></label>

        </div>
        <p className="steam-count">{state.total ? `${state.page * 30 + 1}–${Math.min((state.page + 1) * 30, state.total)} of ${state.total.toLocaleString()} games` : view === "review" ? "All clear. No games are unresolved." : "No games here yet. Refresh your library or change the filters."}</p>
        <div className="steam-grid" aria-busy={searchLoading}>{state.games.map((row) => {
          const options = row.game ? steamPlatforms(row.game) : [];
          const canImport = !row.ignored && !row.libraryItemId && row.available && options.length > 0;
          const status = row.libraryItemId ? "In your library" : row.ignored ? "Excluded" : !row.available ? "Not in latest refresh" : row.importedAt ? "Previously imported" : options.length ? "Ready to add" : row.matchedAt ? row.game ? "Platform missing" : "No match" : "Waiting to match";
          return <article className="steam-game" key={row.appId}>
            <button className="steam-game-open" disabled={working} aria-label={`Open ${row.name}`} onClick={() => row.game ? void openGame(row.game) : setMatching(row.appId)}>
              <SteamArtwork appId={row.appId} coverUrl={row.game?.coverUrl}/>
              <div className="steam-game-body"><span className={`steam-badge${row.libraryItemId || options.length && !row.ignored ? " is-matched" : ""}`}>{status}</span><h3 title={row.name}>{row.name}</h3><p>{totalPlaytime(row.playtimeMinutes)}</p></div>
            </button>
            {!row.libraryItemId && <div className="steam-card-actions">{canImport && row.importedAt && <button disabled={working} onClick={() => void resolve(row.appId).catch((error) => setError(error.message))}>Add to library</button>}
              <button className={canImport ? "tool-button" : "secondary"} disabled={working || !row.available} onClick={() => setMatching(row.appId)}>{canImport ? "Edit match" : "Set match"}<span className="sr-only"> for {row.name}</span></button></div>}
          </article>;
        })}</div>
        <div className="steam-footer"><div className="person-actions"><button className="secondary" disabled={working || state.page === 0} onClick={() => void load(state.page - 1)}>Previous</button><button className="secondary" disabled={working || (state.page + 1) * 30 >= state.total} onClick={() => void load(state.page + 1)}>Next</button></div></div>
      </section>
      <details className="steam-activity"><summary>Recently played on Steam</summary><p>Activity snapshot · {date(state.connection.activityAt)}. This doesn’t change your manually marked currently playing games.</p>{!state.recent ? <p>Recent activity is unavailable. Refresh your library and check Steam privacy settings.</p> : !state.recent.length ? <p>No recent games reported.</p> : <ul className="steam-recent">{state.recent.slice(0, 10).map((game) => <li key={game.appId}><SteamArtwork appId={game.appId}/><div><strong>{game.name}</strong><p>{game.recentMinutes === null ? "Recent playtime unavailable" : `${hours(game.recentMinutes)} recently`}</p></div></li>)}</ul>}</details>
    </>}
  </div>
    {detailGame && <GameDetailsDialog key={detailGame.igdbId} game={detailGame} saved={copies.filter((copy) => copy.igdbId === detailGame.igdbId)} signedIn onClose={() => setDetailGame(null)}
      onAdd={addPlatform}
      onRemove={(id) => updateCopy(`/api/library/${id}`, "DELETE")}
      onPlaying={(id, playing) => updateCopy(`/api/library/${id}/playing`, playing ? "PUT" : "DELETE")}/>}
    {matching !== null && <GamePicker title="Set Steam match" description={`Steam: ${state?.games.find((row) => row.appId === matching)?.name ?? ""}`} searchLabel="Search games…" initialQuery={state?.games.find((row) => row.appId === matching)?.name.slice(0, 100) ?? ""} source={steamMatchSource} actionLabel="Add" selectedLabel="Matched" isSelected={() => false}
      emptyText="Search for the matching game on IGDB." onClose={() => setMatching(null)} onToggle={(item) => resolve(matching, item.id)}/>}
  </>;
}
