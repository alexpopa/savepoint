"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, Gamepad2, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import type { CatalogGame, SavedGame } from "../lib/game-types";

type Props = {
  game: CatalogGame;
  saved: SavedGame[];
  signedIn: boolean;
  loginPath?: string;
  onClose: () => void;
  onAdd?: (platformId: number) => Promise<void>;
  onRemove?: (id: number) => Promise<void>;
};

export default function GameDetailsDialog({ game, saved, signedIn, loginPath, onClose, onAdd, onRemove }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<CatalogGame>(game);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    void fetch(`/api/igdb/games/${game.igdbId}`).then(async (response) => {
      const data = await response.json() as { game?: CatalogGame; error?: string };
      if (!response.ok || !data.game) throw new Error(data.error || "Could not load game details.");
      if (active) setDetails(data.game);
    }).catch((error) => { if (active) setDetailError(error instanceof Error ? error.message : "Could not load game details."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; element?.close(); };
  }, [game.igdbId]);

  async function run(action: () => Promise<void>) {
    setActionError(""); setBusy(true);
    try { await action(); return true; }
    catch (error) { setActionError(error instanceof Error ? error.message : "Could not update your library."); return false; }
    finally { setBusy(false); }
  }

  const legacy = saved.find((item) => item.platformId === 0);
  const options = details.platformOptions.length ? details.platformOptions : [{ id: 0, name: legacy?.platformName || (legacy ? "Platform not set" : "Platform not listed") }];
  const displayOptions = legacy && options[0]?.id !== 0 ? [{ id: 0, name: "Platform not set" }, ...options] : options;
  const coverUrl = details.coverUrl?.replace("/t_cover_big/", "/t_cover_big_2x/");
  const platformsReady = (!loading && !detailError) || game.platformOptions.length > 0;

  return <dialog ref={dialog} className="game-dialog" onClose={onClose} aria-labelledby="game-dialog-title">
    <div className="game-dialog-header"><span className="eyebrow"><Gamepad2 size={14}/> IGDB GAME FILE</span><button className="dialog-close" type="button" aria-label="Close game details" onClick={() => dialog.current?.close()}><X size={20}/></button></div>
    <div className="game-dialog-scroll">
      <div className="game-dialog-hero">
        <div className="game-dialog-art">{coverUrl ? <img src={coverUrl} alt={`${details.name} cover`}/> : <div className="cover-fallback"><Gamepad2 size={44}/><span>NO COVER</span></div>}</div>
        <div className="game-dialog-intro"><p className="game-dialog-kicker">{details.genres?.slice(0, 2).join(" / ") || "VIDEO GAME"}</p><h2 id="game-dialog-title">{details.name}</h2>
          <div className="game-dialog-facts"><span><CalendarDays size={16}/>{details.releaseDate ? new Date(`${details.releaseDate}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : details.releaseYear || "Release date unknown"}</span><span><Gamepad2 size={16}/>{details.platformOptions.length} {details.platformOptions.length === 1 ? "platform" : "platforms"}</span></div>
          {details.summary && <p className="game-dialog-summary">{details.summary}</p>}
          {loading && <p className="game-dialog-loading"><LoaderCircle className="spin" size={16}/> Loading full game details…</p>}
          {detailError && <p className="game-dialog-loading" role="status">{detailError} Platform details may be unavailable or out of date.</p>}
        </div>
      </div>
      {details.screenshotUrls && details.screenshotUrls.length > 0 && <div className="game-dialog-screenshots" aria-label="Game screenshots">{details.screenshotUrls.map((url, index) => <img src={url} alt={`${details.name} screenshot ${index + 1}`} key={url} loading="lazy"/>)}</div>}
      {details.storyline && <section className="game-dialog-section"><h3>Story</h3><p>{details.storyline}</p></section>}
      <div className="game-dialog-metadata">
        {([ ["Genres", details.genres], ["Game modes", details.gameModes], ["Perspectives", details.perspectives], ["Themes", details.themes], ["Developers", details.developers], ["Publishers", details.publishers] ] as [string, string[] | undefined][]).filter(([, values]) => values?.length).map(([label, values]) => <div key={label}><span>{label}</span><strong>{values?.join(" · ")}</strong></div>)}
        {details.rating !== null && details.rating !== undefined && <div><span>IGDB rating</span><strong>{details.rating} / 100{details.ratingCount ? ` · ${details.ratingCount} ratings` : ""}</strong></div>}
      </div>
      <section className="game-dialog-platforms" aria-labelledby="game-dialog-platforms-title"><div className="game-dialog-section-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h3 id="game-dialog-platforms-title">Platforms</h3></div></div>
        {!platformsReady ? <p className="game-dialog-loading">{loading ? <><LoaderCircle className="spin" size={16}/> Loading platform choices…</> : "Platform choices are temporarily unavailable."}</p> : <><p className="game-dialog-help">{signedIn ? "Add each platform you own. Saved copies can be removed here." : "Sign in to add a platform to your library."}</p><div className="platform-list">{displayOptions.map((option) => {
          const owned = saved.find((item) => item.platformId === option.id);
          return <div className="platform-row" key={option.id}><span className="platform-row-name">{option.name}{owned && <small><Check size={13}/> In your library</small>}</span>{signedIn ? owned ? <button type="button" className="platform-action is-remove" disabled={busy} onClick={() => onRemove && void run(() => onRemove(owned.id))}><Trash2 size={15}/> Remove</button> : <button type="button" className="platform-action is-add" disabled={busy} onClick={() => onAdd && void run(() => onAdd(option.id))}><Plus size={15}/> Add</button> : <span className="platform-unowned">Available</span>}</div>;
        })}</div>{!signedIn && <a className="game-dialog-signin" href={loginPath}><Plus size={16}/> Sign in to build your library</a>}</>}
      </section>
      {actionError && <p className="game-dialog-error" role="alert">{actionError}</p>}
      <p className="game-dialog-credit">Game data and artwork provided by IGDB.</p>
    </div>
  </dialog>;
}
