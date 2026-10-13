"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { formatHours, hoursInput, parseHours, type Playtime } from "../lib/playtime";

type Props = { copyId: number; label: string; playtime: Playtime; disabled?: boolean; onChange?: (playtime: Playtime) => void };

// Time played for one owned platform copy, inside the game popup. Saving an empty field follows the connected services again.
export default function PlaytimeEditor({ copyId, label, playtime: initial, disabled, onChange }: Props) {
  const [playtime, setPlaytime] = useState(initial);
  const [value, setValue] = useState(hoursInput(initial.own ?? initial.source?.minutes ?? null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsed = parseHours(value);
  const changed = parsed !== (playtime.own ?? playtime.source?.minutes ?? null) && !(parsed === null && playtime.own === null);
  const offer = playtime.own !== null && playtime.source && playtime.source.minutes !== playtime.own ? playtime.source : null;

  async function save(minutes: number | null) {
    if (Number.isNaN(minutes)) { setError("Enter hours as a number, such as 12.5."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/library/${copyId}/playtime`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ minutes }) });
      const result = await response.json() as { playtime?: Playtime; error?: string };
      if (!response.ok || !result.playtime) throw new Error(result.error || "Could not update time played.");
      setPlaytime(result.playtime); setValue(hoursInput(result.playtime.own ?? result.playtime.source?.minutes ?? null)); onChange?.(result.playtime);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not update time played."); }
    finally { setBusy(false); }
  }

  return <form className="playtime-row" onSubmit={(event) => { event.preventDefault(); void save(parsed); }}>
    <label className="playtime-field"><Clock size={15} aria-hidden="true"/><span>{playtime.eventMinutes ? "Library hours" : "Time played"}</span>
      <input type="text" inputMode="decimal" value={value} placeholder="0" maxLength={9} aria-label={`Hours played on ${label}`} disabled={disabled || busy} onChange={(event) => setValue(event.target.value)}/><span aria-hidden="true">h</span></label>
    {changed ? <button type="submit" className="platform-action" disabled={disabled || busy}>Save</button>
      : offer ? <button type="button" className="platform-action" disabled={disabled || busy} onClick={() => void save(null)}>Use {formatHours(offer.minutes)} from {offer.names}</button>
      : playtime.own === null && playtime.source ? <small className="playtime-source">From {playtime.source.names}</small> : null}
    {Boolean(playtime.eventMinutes) && <small className="playtime-source">+ {formatHours(playtime.eventMinutes!)} entered in events · {formatHours(playtime.minutes ?? 0)} total</small>}
    {error && <p className="playtime-error" role="alert">{error}</p>}
  </form>;
}
