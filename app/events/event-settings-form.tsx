"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { pickerRequest } from "../game-picker";
import PlatformFilter, { type Platform } from "../platform-filter";
import { eventDescriptionLimit, eventNameLimit, eventRulesLimit, type EventVisibility } from "../../lib/event-rules";
import type { EventDetail } from "../../lib/events";

type Multipliers = { hourPoints: number; beatenPoints: number; completedPoints: number };
export type ConsoleRow = Multipliers & { platformId: number; name: string };
export type SettingsValues = Multipliers & { name: string; description: string; rules: string; visibility: EventVisibility; startDay: string; endDay: string; timeZone: string; consoles: ConsoleRow[] };
type Props = { eventId?: number; initial?: SettingsValues; onSaved?: (event: EventDetail, message: string) => void };

// An empty time zone means the browser's own, which is only known after hydration.
const blank: SettingsValues = { name: "", description: "", rules: "", visibility: "public", startDay: "", endDay: "", timeZone: "", hourPoints: 1, beatenPoints: 1, completedPoints: 0, consoles: [] };
let zoneList: string[] | null = null;
const browserZones = () => zoneList ??= (() => { try { return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { return []; } })();
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const noServerZones: string[] = [];
const subscribe = () => () => {};

// Creates an event, or saves an existing one's details. Multipliers are tenths on the server and plain numbers here.
export default function EventSettingsForm({ eventId, initial, onSaved }: Props) {
  const [values, setValues] = useState(initial ?? blank);
  const timeZones = useSyncExternalStore(subscribe, browserZones, () => noServerZones);
  const localZone = useSyncExternalStore(subscribe, browserZone, () => "UTC");
  const timeZone = values.timeZone || localZone;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // The console list opens on request, so most events never see it.
  const [consolesOpen, setConsolesOpen] = useState(Boolean(initial?.consoles.length));
  const [platforms, setPlatforms] = useState<Platform[] | null>(null);
  const [platformsFailed, setPlatformsFailed] = useState(false);

  useEffect(() => {
    if (!consolesOpen || platforms) return;
    pickerRequest<{ platforms: Platform[] }>("/api/igdb/platforms", undefined, "Could not load consoles.")
      .then((data) => setPlatforms([...data.platforms].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setPlatformsFailed(true));
  }, [consolesOpen, platforms]);
  // Checking a console adds it at the event's own multipliers; unchecking removes it. Rows keep the order they were added.
  function chooseConsoles(ids: number[]) {
    const kept = values.consoles.filter((row) => ids.includes(row.platformId));
    const added = ids.filter((id) => !kept.some((row) => row.platformId === id)).flatMap((id) => {
      const platform = platforms?.find((entry) => entry.id === id);
      return platform ? [{ platformId: id, name: platform.name, hourPoints: values.hourPoints, beatenPoints: values.beatenPoints, completedPoints: values.completedPoints }] : [];
    });
    set("consoles", [...kept, ...added]);
  }
  const setConsole = (platformId: number, key: keyof Multipliers, value: number) =>
    set("consoles", values.consoles.map((row) => row.platformId === platformId ? { ...row, [key]: value } : row));
  const consoleField = (row: ConsoleRow, key: keyof Multipliers, label: string) => <label className="event-field is-compact"><span>{label}</span>
    <input aria-label={`${row.name}: ${label === "100%" ? "100% bonus" : label === "Beaten" ? "beaten bonus" : "points per hour"}`} type="number" min={0} max={100} step={0.5} required value={Number.isFinite(row[key]) ? row[key] : ""} onChange={(event) => setConsole(row.platformId, key, event.target.valueAsNumber)}/></label>;

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => { setValues((current) => ({ ...current, [key]: value })); setNotice(""); };

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(eventId ? `/api/events/${eventId}` : "/api/events", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(eventId ? { action: "settings", settings: { ...values, timeZone } } : { ...values, timeZone }) });
      const result = await response.json() as { id?: number; event?: EventDetail; message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save the event.");
      if (!eventId && result.id) { window.location.assign(new URL(`/events/${result.id}`, window.location.origin)); return; }
      if (result.event) onSaved?.(result.event, result.message ?? "Event saved.");
      setNotice(result.message ?? "Event saved.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save the event."); }
    finally { setBusy(false); }
  }

  const points = (key: "hourPoints" | "beatenPoints" | "completedPoints", label: string, help: string) => <label className="event-field">
    <span>{label}</span><input type="number" min={0} max={100} step={0.5} required value={Number.isFinite(values[key]) ? values[key] : ""} onChange={(event) => set(key, event.target.valueAsNumber)}/><small>{help}</small></label>;

  return <form className="settings-card event-form" onSubmit={(event) => void save(event)}>
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    <label className="event-field"><span>Name</span><input value={values.name} maxLength={eventNameLimit} required onChange={(event) => set("name", event.target.value)} placeholder="Backlog Season"/></label>
    <label className="event-field"><span>Description</span><textarea value={values.description} maxLength={eventDescriptionLimit} rows={3} onChange={(event) => set("description", event.target.value)} placeholder="Play the games you never finished."/></label>
    <label className="event-field"><span>Rules</span><textarea value={values.rules} maxLength={eventRulesLimit} rows={5} onChange={(event) => set("rules", event.target.value)} placeholder="A game needs 8 hours of play before it counts as beaten."/><small>Rules the site can’t check. Players follow them on the honor system, and hosts can correct results.</small></label>
    <fieldset className="event-field"><legend>Who can join</legend><div className="visibility-options">
      <button type="button" className={values.visibility === "public" ? "selected" : ""} aria-pressed={values.visibility === "public"} onClick={() => set("visibility", "public")}>Public</button>
      <button type="button" className={values.visibility === "private" ? "selected" : ""} aria-pressed={values.visibility === "private"} onClick={() => set("visibility", "private")}>Private</button>
    </div><small>{values.visibility === "public" ? "Any signed-in player can join." : "Only players you invite can see and join it."}</small></fieldset>
    <div className="event-field-row">
      <label className="event-field"><span>First day</span><input type="date" required value={values.startDay} onChange={(event) => set("startDay", event.target.value)}/></label>
      <label className="event-field"><span>Last day</span><input type="date" required min={values.startDay || undefined} value={values.endDay} onChange={(event) => set("endDay", event.target.value)}/></label>
      <label className="event-field"><span>Time zone</span><select aria-label="Time zone" value={timeZone} onChange={(event) => set("timeZone", event.target.value)}>
        {(timeZones.includes(timeZone) ? timeZones : [timeZone, ...timeZones]).map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
      </select></label>
    </div>
    <fieldset className="event-field"><legend>Scoring</legend><div className="event-field-row">
      {points("hourPoints", "Points per hour", "Every hour played.")}
      {points("beatenPoints", "Beaten bonus per hour", "Added for each hour of a beaten game.")}
      {points("completedPoints", "Completed bonus per hour", "Added again at 100%.")}
    </div>
    {!consolesOpen ? <button type="button" className="event-more" onClick={() => setConsolesOpen(true)}><Plus size={16} aria-hidden="true"/>Score a console differently</button> : <div className="event-consoles">
      <p className="event-consoles-title">Console multipliers <small>Games on these consoles use their own multipliers.</small></p>
      {values.consoles.map((row) => <div className="event-console" key={row.platformId}>
        <strong>{row.name}</strong>
        <div className="event-field-row">{consoleField(row, "hourPoints", "Per hour")}{consoleField(row, "beatenPoints", "Beaten")}{consoleField(row, "completedPoints", "100%")}</div>
        <button type="button" className="event-edit" aria-label={`Remove ${row.name}`} title="Remove" onClick={() => set("consoles", values.consoles.filter((entry) => entry.platformId !== row.platformId))}><X size={16} aria-hidden="true"/></button>
      </div>)}
      <PlatformFilter className="event-console-filter" label="Consoles" noneLabel="Choose consoles" menuLabel="Consoles with their own multipliers" platforms={platforms ?? []}
        selected={values.consoles.map((row) => row.platformId)} loading={!platforms && !platformsFailed} error={platformsFailed} onChange={chooseConsoles}/>
    </div>}
    </fieldset>
    <div className="person-actions"><button type="submit" disabled={busy}>{eventId ? "Save event" : "Create event"}</button></div>
  </form>;
}
