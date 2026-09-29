"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Gamepad2, LoaderCircle, Plus, Search, X } from "lucide-react";
import PlatformFilter, { type Platform } from "./platform-filter";

export type PickerItem = { id: number; name: string; coverUrl: string | null; detail: string };
// `heading` names where the rows came from when a source switches between several.
export type PickerPage = { items: PickerItem[]; next: string | null; platforms?: Platform[]; heading?: string };
// Keep sources at module level: a new object each render would refetch on every render.
export type PickerSource = {
  load: (filters: { query: string; platformIds: number[]; cursor?: string }, signal: AbortSignal) => Promise<PickerPage>;
};
type Props = {
  title: string;
  searchLabel: string;
  source: PickerSource;
  selectedLabel: string;
  isSelected: (item: PickerItem) => boolean;
  onToggle: (item: PickerItem, selected: boolean) => Promise<void>;
  onClose: () => void;
  emptyText: ReactNode;
  fullText?: string;
};

export async function pickerRequest<T>(url: string, signal: AbortSignal | undefined, fallback: string): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}
// Query string for `/api/library/copies`, shared by the pickers that read the viewer's library.
export function libraryParams(query: string, platformIds: number[], cursor?: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  platformIds.forEach((id) => params.append("platform", String(id)));
  if (cursor) params.set("cursor", cursor);
  return params;
}
const aborted = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

// Each request cancels the one before it, so a slow earlier search can never overwrite a newer one.
function loadPage(pending: { current: AbortController | null }, source: PickerSource, query: string, platformIds: number[], cursor?: string) {
  pending.current?.abort();
  const controller = new AbortController();
  pending.current = controller;
  return source.load({ query: query.trim(), platformIds, cursor }, controller.signal);
}

// A searchable, filterable list of games in a modal. Each row toggles in place, so the page behind
// updates without reloading. `fullText` disables adding (not removing) when the target is full.
export default function GamePicker({ title, searchLabel, source, selectedLabel, isSelected, onToggle, onClose, emptyText, fullText }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [platformIds, setPlatformIds] = useState<number[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [heading, setHeading] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    // Closing cancels whichever request is newest at that moment, not the one when the dialog opened.
    const requests = pending;
    return () => { requests.current?.abort(); element?.close(); };
  }, []);

  // Typing waits for a short pause before searching; changing platforms searches at once.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      loadPage(pending, source, query, platformIds).then((page) => {
        setItems(page.items); setNext(page.next); setHeading(page.heading ?? ""); setLoading(false); setLoaded(true);
        if (page.platforms) setPlatforms(page.platforms);
      }).catch((error) => { if (!aborted(error)) { setError(error instanceof Error ? error.message : "Could not load games."); setLoading(false); } });
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, platformIds, source]);

  async function loadMore() {
    if (!next) return;
    setLoading(true); setError("");
    try {
      const page = await loadPage(pending, source, query, platformIds, next);
      setItems((current) => [...current, ...page.items]); setNext(page.next); setLoading(false);
    } catch (error) { if (!aborted(error)) { setError(error instanceof Error ? error.message : "Could not load more games."); setLoading(false); } }
  }

  async function toggle(item: PickerItem) {
    setBusy(item.id); setError("");
    try { await onToggle(item, !isSelected(item)); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not update this game."); }
    finally { setBusy(null); }
  }

  const filtered = Boolean(query.trim() || platformIds.length);
  return <dialog ref={dialog} className="game-dialog game-picker" onClose={onClose} aria-labelledby="game-picker-title">
    <div className="game-dialog-header"><h2 id="game-picker-title" className="eyebrow"><Gamepad2 size={14} aria-hidden="true"/> {title}</h2><button className="dialog-close" type="button" aria-label="Close" onClick={() => dialog.current?.close()}><X size={20}/></button></div>
    <div className="game-picker-controls">
      <label className="game-picker-search"><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} maxLength={100} autoComplete="off" spellCheck={false}/></label>
      <PlatformFilter platforms={platforms} selected={platformIds} onChange={setPlatformIds} loading={!loaded && !platforms.length} className="is-end"/>
    </div>
    {fullText && <p className="game-picker-note">{fullText}</p>}
    <div className="game-dialog-scroll game-picker-scroll">
      {error && <p className="game-dialog-error" role="alert">{error}</p>}
      <p className="shelf-status" role="status">{loading ? "Loading games" : `${items.length}${next ? " or more" : ""} ${items.length === 1 ? "game" : "games"} shown${heading ? ` from ${heading}` : ""}`}</p>
      {/* Results stay in place until new ones arrive, so filtering never blanks the list. */}
      <div className="game-picker-results" aria-busy={loading}>
        {heading && <p className="game-picker-heading" aria-hidden="true">{heading}</p>}
        {items.length > 0 && <ul className="game-picker-list">
          {items.map((item) => {
            const selected = isSelected(item);
            return <li key={item.id}><button type="button" className="game-picker-item" aria-pressed={selected} disabled={busy === item.id || (!selected && Boolean(fullText))} onClick={() => void toggle(item)}>
              <PickerCover item={item}/>
              <span className="game-picker-text"><span className="playing-name">{item.name}</span><span className="playing-platform">{item.detail}</span></span>
              <span className="game-picker-state">{busy === item.id ? <LoaderCircle className="spin" size={15} aria-hidden="true"/> : selected ? <Check size={15} aria-hidden="true"/> : <Plus size={15} aria-hidden="true"/>}{selected ? selectedLabel : "Add"}</span>
            </button></li>;
          })}
        </ul>}
        {loaded && !error && items.length === 0 && <p className="game-picker-empty">{filtered ? "No games match." : emptyText}</p>}
      </div>
      {(next || !loaded) && <div className="game-picker-more">
        {next ? <button type="button" className="profile-tool" disabled={loading} onClick={() => void loadMore()}>{loading ? <LoaderCircle className="spin" size={15} aria-hidden="true"/> : null}Load more</button>
          : <LoaderCircle className="spin" size={20} aria-hidden="true"/>}
      </div>}
    </div>
  </dialog>;
}

function PickerCover({ item }: { item: PickerItem }) {
  const [failed, setFailed] = useState(false);
  return <span className="game-picker-cover">{item.coverUrl && !failed
    ? <img src={item.coverUrl} alt="" loading="lazy" onError={() => setFailed(true)}/>
    : <Gamepad2 size={20} aria-hidden="true"/>}</span>;
}
