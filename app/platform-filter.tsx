"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export type Platform = { id: number; name: string };

// A dropdown of platform checkboxes with its own search field, used by search and the game pickers.
// Typing narrows the visible choices without changing the selection.
export default function PlatformFilter({ platforms, selected, onChange, loading = false, error = false, className = "" }: { platforms: Platform[]; selected: number[]; onChange: (ids: number[]) => void; loading?: boolean; error?: boolean; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filterRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !filterRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Close only the menu, not a dialog the filter sits in.
      event.preventDefault();
      setOpen(false);
      filterRef.current?.querySelector<HTMLButtonElement>(".platform-filter-trigger")?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function change(ids: number[]) { onChange([...new Set(ids)].sort((a, b) => a - b)); }
  function toggle(platformId: number) { change(selected.includes(platformId) ? selected.filter((value) => value !== platformId) : [...selected, platformId]); }
  const normalized = search.trim().toLowerCase();
  const visible = platforms.filter((platform) => platform.name.toLowerCase().includes(normalized));

  return <div ref={filterRef} className={`search-platform-filter${selected.length ? " active" : ""}${className ? ` ${className}` : ""}`}>
    <span id={`${id}-label`}>Platform</span>
    <button type="button" className="platform-filter-trigger" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-options`} disabled={loading || error} onClick={() => {
      if (!open) setSearch("");
      setOpen(!open);
    }}>
      <span id={`${id}-value`}>{loading ? "Loading platforms…" : error ? "Unavailable" : selected.length ? `${selected.length} selected` : "All platforms"}</span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    {open && <div className="platform-filter-menu" id={`${id}-options`} role="group" aria-label="Filter games by platform">
      <div className="platform-filter-search"><Search size={16} aria-hidden="true"/><input ref={searchRef} type="search" autoFocus aria-label="Search platforms" placeholder="Search platforms" value={search} onChange={(event) => setSearch(event.target.value)}/>{selected.length > 0 && <button className="platform-filter-clear" type="button" aria-label="Clear selected platforms" title="Clear selected platforms" onClick={() => { change([]); searchRef.current?.focus(); }}><X size={16} aria-hidden="true"/></button>}</div>
      <div className="platform-filter-options" role="group" aria-label="Platform options">
        {visible.length ? visible.map((platform) => <label className="platform-filter-option" key={platform.id}><input type="checkbox" checked={selected.includes(platform.id)} onChange={() => toggle(platform.id)}/><span>{platform.name}</span></label>) : <p className="platform-filter-empty" role="status">No platforms found.</p>}
      </div>
    </div>}
  </div>;
}
