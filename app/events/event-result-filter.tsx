"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { eventGameFilters, type EventGameFilter } from "../../lib/event-game-view";

// Short result list follows the shared platform dropdown, without a search field.
export default function EventResultFilter({ selected, onChange }: { selected: EventGameFilter[]; onChange: (filters: EventGameFilter[]) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false); }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault(); setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>(".platform-filter-trigger")?.focus();
    }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={ref} className={`search-platform-filter event-game-control${selected.length ? " active" : ""}`}>
    <span id={`${id}-label`}>Result</span>
    <button type="button" className="platform-filter-trigger" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-options`} onClick={() => setOpen(!open)}>
      <span id={`${id}-value`}>{selected.length ? `${selected.length} selected` : "All games"}</span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    {open && <div className="platform-filter-menu" id={`${id}-options`} role="group" aria-label="Filter event games by result"><div className="platform-filter-options">
      <label className="platform-filter-option"><input type="checkbox" checked={!selected.length} onChange={() => onChange([])}/><span>All games</span></label>
      {eventGameFilters.map(([key, label]) => <label className="platform-filter-option" key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => onChange(selected.includes(key) ? selected.filter((filter) => filter !== key) : [...selected, key])}/><span>{label}</span></label>)}
    </div></div>}
  </div>;
}
