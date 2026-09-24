"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Gamepad2, LoaderCircle, Plus, Search, UserPlus, Users, X } from "lucide-react";
import FriendButton, { type Relationship } from "../friend-button";
import GameDetailsDialog from "../game-details-dialog";
import type { CatalogGame, SavedGame } from "../../lib/game-types";

type Player = { userId: string; displayName: string; isPublic: boolean; relationship: Relationship };
type Tab = "all" | "games" | "players";
type Platform = { id: number; name: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function SearchResults({ query, signedIn, initialPlatformIds }: { query: string; signedIn: boolean; initialPlatformIds: number[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [platformIds, setPlatformIds] = useState<number[]>(initialPlatformIds);
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  const platformFilterRef = useRef<HTMLDivElement>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);
  const [platformsError, setPlatformsError] = useState("");
  const [games, setGames] = useState<CatalogGame[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<CatalogGame | null>(null);
  const [busyGame, setBusyGame] = useState<number | null>(null);
  const [gamesError, setGamesError] = useState("");
  const [playersError, setPlayersError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  useEffect(() => {
    if (query.length < 2 || query.length > 100) return;
    let active = true;
    void api<{ platforms: Platform[] }>("/api/igdb/platforms").then((data) => { if (active) setPlatforms(data.platforms); })
      .catch((error) => { if (active) setPlatformsError(error.message); }).finally(() => { if (active) setLoadingPlatforms(false); });
    return () => { active = false; };
  }, [query]);

  useEffect(() => {
    if (!platformMenuOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !platformFilterRef.current?.contains(event.target)) setPlatformMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPlatformMenuOpen(false);
        platformFilterRef.current?.querySelector<HTMLButtonElement>(".platform-filter-trigger")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [platformMenuOpen]);

  useEffect(() => {
    if (query.length < 2 || query.length > 100) return;
    let active = true;
    const params = new URLSearchParams({ q: query });
    platformIds.forEach((id) => params.append("platform", String(id)));
    void api<{ games: CatalogGame[] }>(`/api/igdb/search?${params.toString()}`).then((data) => { if (active) setGames(data.games); })
      .catch((error) => { if (active) setGamesError(error.message); }).finally(() => { if (active) setLoadingGames(false); });
    return () => { active = false; };
  }, [query, platformIds]);

  useEffect(() => {
    if (query.length < 2 || query.length > 100) return;
    let active = true;
    const q = encodeURIComponent(query);
    void api<{ players: Player[] }>(`/api/players/search?q=${q}`).then((data) => { if (active) setPlayers(data.players); })
      .catch((error) => { if (active) setPlayersError(error.message); }).finally(() => { if (active) setLoadingPlayers(false); });
    return () => { active = false; };
  }, [query]);

  useEffect(() => {
    if (signedIn) void api<{ games: SavedGame[] }>("/api/library").then((data) => setSaved(data.games)).catch(() => {});
  }, [signedIn]);

  useEffect(() => {
    function syncPlatformFromUrl() {
      const values = new URL(window.location.href).searchParams.getAll("platform");
      const nextPlatformIds = [...new Set(values.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
      setLoadingGames(true);
      setGamesError("");
      setGames([]);
      setPlatformIds(nextPlatformIds);
    }
    window.addEventListener("popstate", syncPlatformFromUrl);
    return () => window.removeEventListener("popstate", syncPlatformFromUrl);
  }, []);

  function changePlatforms(nextPlatformIds: number[]) {
    const normalized = [...new Set(nextPlatformIds)].sort((a, b) => a - b);
    setLoadingGames(true);
    setGamesError("");
    setGames([]);
    setPlatformIds(normalized);
    const url = new URL(window.location.href);
    url.searchParams.delete("platform");
    normalized.forEach((id) => url.searchParams.append("platform", String(id)));
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function togglePlatform(id: number) {
    changePlatforms(platformIds.includes(id) ? platformIds.filter((platformId) => platformId !== id) : [...platformIds, id]);
  }

  async function refreshSaved() {
    const data = await api<{ games: SavedGame[] }>("/api/library");
    setSaved(data.games);
  }

  async function addGame(game: CatalogGame, platformId: number) {
    setBusyGame(game.igdbId); setActionError("");
    try {
      await api("/api/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ igdbId: game.igdbId, platformId }) });
      await refreshSaved();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Could not add game."); throw error; }
    finally { setBusyGame(null); }
  }

  async function removeGame(id: number) {
    await api(`/api/library/${id}`, { method: "DELETE" });
    await refreshSaved();
  }

  const valid = query.length >= 2 && query.length <= 100;
  const showPlayers = tab !== "games";
  const showGames = tab !== "players";
  const done = !loadingGames && !loadingPlayers;
  const selectedPlatforms = platforms.filter((platform) => platformIds.includes(platform.id));
  const returnParams = new URLSearchParams({ q: query });
  platformIds.forEach((id) => returnParams.append("platform", String(id)));
  const returnTo = `/search?${returnParams.toString()}`;
  const loginPath = `/login?return_to=${encodeURIComponent(returnTo)}`;
  return <div className="library-wrap search-wrap">
    <p className="eyebrow"><Search size={14}/> DISCOVER RGBONER</p>
    <h1>Search</h1>
    <p className="subcopy">Find games to save and players to connect with.</p>
    {!valid ? <div className="empty-state"><Search size={28}/><h2>Search games and players</h2><p>Enter at least two characters in the search bar above.</p></div> : <>
      <p className="search-summary">Results for <strong>“{query}”</strong></p>
      <div className="search-tabs" role="tablist" aria-label="Result type">
        {(["all", "games", "players"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value === "all" ? <Search size={15}/> : value === "games" ? <Gamepad2 size={16}/> : <Users size={16}/>} {value === "all" ? "All" : value === "games" ? `Games${loadingGames ? "" : ` ${games.length}`}` : `Players${loadingPlayers ? "" : ` ${players.length}`}`}</button>)}
      </div>
      {actionError && <div className="notice error search-notice" role="alert">{actionError}</div>}
      {showPlayers && <section className="search-group" aria-labelledby="players-heading"><div className="search-group-heading"><div><p className="eyebrow">COMMUNITY</p><h2 id="players-heading">Players</h2></div><span>{loadingPlayers ? "Searching…" : `${players.length} found`}</span></div>
        {loadingPlayers ? <div className="search-loading"><LoaderCircle className="spin" size={18}/> Searching players…</div> : playersError ? <div className="search-empty" role="alert">{playersError}</div> : players.length ? <div className="search-player-list">{players.map((player) => {
          const profilePath = `/users/${encodeURIComponent(player.userId)}`;
          return <article className="search-player" key={player.userId}>
            <a href={signedIn ? profilePath : `/login?return_to=${encodeURIComponent(profilePath)}`} className="search-player-main"><span className="account-avatar">{player.displayName.charAt(0).toUpperCase()}</span><span><strong>{player.displayName}</strong><small>{player.isPublic ? "Public library" : player.relationship?.status === "accepted" ? "Private library · Friend" : "Private library"}</small></span></a>
            <div className="search-player-actions"><a className="view-profile" href={signedIn ? profilePath : `/login?return_to=${encodeURIComponent(profilePath)}`}>{signedIn ? "View profile" : "Sign in to view"}</a>{signedIn ? <FriendButton userId={player.userId} initialRelationship={player.relationship}/> : <a className="friend-button" href={loginPath}><UserPlus size={16}/> Sign in to add friend</a>}</div>
          </article>;
        })}</div> : <div className="search-empty">No players matched “{query}”.</div>}
      </section>}
      {showGames && <section className="search-group" aria-labelledby="games-heading" aria-busy={loadingGames}><div className="search-group-heading"><div><p className="eyebrow">IGDB CATALOG</p><h2 id="games-heading">Games</h2></div><div className="search-group-tools">
        <div ref={platformFilterRef} className={`search-platform-filter${platformIds.length ? " active" : ""}`} onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node) || !platformFilterRef.current?.contains(event.relatedTarget)) setPlatformMenuOpen(false);
        }}>
          <span id="platform-filter-label">Platform</span>
          <button type="button" className="platform-filter-trigger" aria-labelledby="platform-filter-label platform-filter-value" aria-expanded={platformMenuOpen} aria-controls="platform-filter-options" disabled={loadingPlatforms || Boolean(platformsError)} onClick={() => setPlatformMenuOpen((open) => !open)}>
            <span id="platform-filter-value">{loadingPlatforms ? "Loading platforms…" : platformsError ? "Unavailable" : platformIds.length ? `${platformIds.length} selected` : "All platforms"}</span><ChevronDown size={16} aria-hidden="true"/>
          </button>
          {platformMenuOpen && <div className="platform-filter-menu" id="platform-filter-options" role="group" aria-label="Filter games by platform">
            {platforms.map((platform) => <label className="platform-filter-option" key={platform.id}><input type="checkbox" checked={platformIds.includes(platform.id)} onChange={() => togglePlatform(platform.id)}/><span>{platform.name}</span></label>)}
          </div>}
        </div>
        {platformIds.length > 0 && <button className="clear-platform-filter" type="button" onClick={() => changePlatforms([])}><X size={15} aria-hidden="true"/> Remove filter</button>}
        <span className="search-results-count">{loadingGames ? "Searching…" : `${games.length} shown`}</span>
      </div></div>
        {platformsError && <p className="search-platform-error" role="status">Platform filter unavailable right now.</p>}
        {loadingGames ? <div className="search-loading"><LoaderCircle className="spin" size={18}/> Searching games…</div> : gamesError ? <div className="search-empty" role="alert">{gamesError}</div> : games.length ? <div className="game-grid">{games.map((game) => {
          const owned = saved.filter((item) => item.igdbId === game.igdbId);
          const onlyPlatform = game.platformOptions.length === 1 ? game.platformOptions[0].id : game.platformOptions.length === 0 ? 0 : null;
          const quickAdd = signedIn && onlyPlatform !== null && !owned.some((item) => item.platformId === onlyPlatform);
          return <article className="game-card result-card" key={game.igdbId}>
            <button className="game-card-open" type="button" onClick={() => setSelectedGame(game)} aria-label={`View details and platforms for ${game.name}`}><div className="game-cover">{game.coverUrl ? <img src={game.coverUrl} alt="" loading="lazy"/> : <div className="cover-fallback"><Gamepad2 size={25}/></div>}</div><div className="game-info"><h3>{game.name}</h3><p>{[game.releaseYear, game.platforms.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "Release year unknown"}</p>{owned.length > 0 && <span className="game-owned-label"><Check size={13}/> {owned.length} {owned.length === 1 ? "platform" : "platforms"} saved</span>}</div></button>
            {quickAdd ? <button type="button" className="add-button" aria-label={`Add ${game.name} to your library`} title="Add to library" disabled={busyGame === game.igdbId} onClick={() => void addGame(game, onlyPlatform).catch(() => {})}>{busyGame === game.igdbId ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>}</button> : <button type="button" className="add-button" aria-label={`View ${game.name} platforms and library options`} title="View platforms" onClick={() => setSelectedGame(game)}>{owned.length ? <Check size={18}/> : <Plus size={18}/>}</button>}
          </article>;
        })}</div> : <div className="search-empty">{selectedPlatforms.length ? `No games on ${selectedPlatforms.map((platform) => platform.name).join(", ")} matched “${query}”.` : `No games matched “${query}”.`}</div>}
      </section>}
      {done && !gamesError && !playersError && games.length === 0 && players.length === 0 && <p className="search-tip">Try a shorter name or a different spelling.</p>}
    </>}
    {selectedGame && <GameDetailsDialog game={selectedGame} saved={saved.filter((item) => item.igdbId === selectedGame.igdbId)} signedIn={signedIn} loginPath={loginPath} onClose={() => setSelectedGame(null)} onAdd={(platformId) => addGame(selectedGame, platformId)} onRemove={removeGame}/>}
  </div>;
}
