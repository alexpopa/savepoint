"use client";

import { useState, type FormEvent } from "react";
import { Copy, Plus, Trash2, X } from "lucide-react";
import EventSettingsForm from "./event-settings-form";
import { eventRequest } from "./event-view";
import GamePicker, { pickerRequest, type PickerSource } from "../game-picker";
import type { Platform } from "../platform-filter";
import type { EventDetail } from "../../lib/events";
import type { CatalogGame } from "../../lib/game-types";

type Kind = "platform" | "game";
type MultiplierValues = { hourPoints: number; beatenPoints: number; completedPoints: number };

const gameSource: PickerSource = {
  async load({ query, platformIds }, signal) {
    const catalog = await pickerRequest<{ platforms: Platform[] }>("/api/igdb/platforms", signal, "Could not load platforms.");
    if (query.length < 2) return { items: [], next: null, platforms: catalog.platforms };
    const params = new URLSearchParams({ q: query });
    platformIds.forEach((id) => params.append("platform", String(id)));
    const { games } = await pickerRequest<{ games: CatalogGame[] }>(`/api/igdb/search?${params}`, signal, "Could not search for games.");
    return { next: null, platforms: catalog.platforms, items: games.map((game) => ({ id: game.igdbId, name: game.name, coverUrl: game.coverUrl,
      detail: [game.releaseYear, game.platforms.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || "Release year unknown" })) };
  },
};

// Hosts' page: details, scoring, and console multipliers in one form, then game multipliers, hosts, invitations, and copying.
export default function EventManage({ initial }: { initial: EventDetail }) {
  const [detail, setDetail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [picking, setPicking] = useState(false);
  const { event } = detail;

  async function act(body: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await eventRequest(event.id, body);
      if (result.event) setDetail(result.event);
      setNotice(result.message ?? "");
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not update the event."); return false; }
    finally { setBusy(false); }
  }

  async function copy() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/events/${event.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "copy" }) });
      const result = await response.json() as { id?: number; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "Could not copy the event.");
      window.location.assign(new URL(`/events/${result.id}/settings`, window.location.origin));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not copy the event."); setBusy(false); }
  }

  const defaults = { hourPoints: event.hourPoints, beatenPoints: event.beatenPoints, completedPoints: event.completedPoints };
  const rows = (kind: Kind) => detail.multipliers.filter((row) => row.kind === kind);

  return <>
    <p className="eyebrow">MANAGE EVENT</p><h1>{event.name}</h1>
    <p className="subcopy"><a className="inline-link" href={`/events/${event.id}`}>Back to the event</a></p>
    {error && <p className="notice error" role="alert"><X size={17} aria-hidden="true"/>{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    <EventSettingsForm eventId={event.id} initial={{ name: event.name, description: event.description, rules: event.rules, visibility: event.visibility, startDay: event.startDay, endDay: event.endDay,
      timeZone: event.timeZone, ...defaults, consoles: rows("platform").map((row) => ({ platformId: row.targetId, name: row.name, hourPoints: row.hourPoints, beatenPoints: row.beatenPoints, completedPoints: row.completedPoints })) }}
      onSaved={(saved) => setDetail(saved)}/>

    <section className="settings-card" aria-labelledby="event-multipliers-title">
      <h2 id="event-multipliers-title">Game multipliers</h2>
      <p>Give single games their own multipliers. They win over a console’s.</p>
      <div className="person-actions event-add-row"><button type="button" disabled={busy} onClick={() => setPicking(true)}><Plus size={16} aria-hidden="true"/> Add a game</button></div>
      {rows("game").length > 0 && <MultiplierRows rows={rows("game")} busy={busy} onSave={(row, values) => act({ action: "set-multiplier", multiplier: { kind: row.kind, targetId: row.targetId, name: row.name, coverUrl: row.coverUrl, ...values } })}
        onRemove={(id) => act({ action: "remove-multiplier", multiplierId: id })}/>}
    </section>

    <PeopleCard title="Hosts" help="Hosts can change anything in this event, including any player’s results. Add friends by display name." action="Add host" busy={busy}
      people={[{ ...detail.owner, label: "Owner" }, ...detail.hosts.map((host) => ({ ...host, label: "" }))]}
      onAdd={(displayName) => act({ action: "add-host", displayName })} onRemove={(userId) => act({ action: "remove-host", userId })} removeLabel="Remove host" fixed={detail.owner.userId}/>
    <PeopleCard title="Invitations" help={event.visibility === "private" ? "Only invited players can see and join this event. They accept on the event page." : "Anyone can join a public event; an invitation points a friend to it."}
      action="Invite" busy={busy} people={detail.invited.map((person) => ({ ...person, label: "Invited" }))}
      onAdd={(displayName) => act({ action: "invite", displayName })} onRemove={(userId) => act({ action: "uninvite", userId })} removeLabel="Withdraw invitation"/>
    {detail.viewer.canCopy && <section className="settings-card"><h2>Copy this event</h2><p>Start a new event with the same description, rules, scoring, and multipliers. Players and results stay here.</p>
      <div className="person-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void copy()}><Copy size={16} aria-hidden="true"/> Copy event</button></div></section>}

    {picking && <GamePicker title="Score a game differently" searchLabel="Search games" source={gameSource} selectedLabel="Added"
      isSelected={(item) => rows("game").some((row) => row.targetId === item.id)} onClose={() => setPicking(false)} emptyText="Type at least two letters to search."
      onToggle={async (item, add) => {
        const existing = rows("game").find((row) => row.targetId === item.id);
        const body = add ? { action: "set-multiplier", multiplier: { kind: "game", targetId: item.id, name: item.name, coverUrl: item.coverUrl, ...defaults } } : { action: "remove-multiplier", multiplierId: existing?.id };
        const result = await eventRequest(event.id, body);
        if (result.event) setDetail(result.event);
      }}/>}
  </>;
}

type Row = EventDetail["multipliers"][number];
function MultiplierRows({ rows, busy, onSave, onRemove }: { rows: Row[]; busy: boolean; onSave: (row: Row, values: MultiplierValues) => Promise<boolean>; onRemove: (id: number) => Promise<boolean> }) {
  if (!rows.length) return <p className="muted">None yet.</p>;
  return <ul className="event-multipliers">{rows.map((row) => <MultiplierRow key={`${row.id}-${row.hourPoints}-${row.beatenPoints}-${row.completedPoints}`} row={row} busy={busy} onSave={onSave} onRemove={onRemove}/>)}</ul>;
}

function MultiplierRow({ row, busy, onSave, onRemove }: { row: Row; busy: boolean; onSave: (row: Row, values: MultiplierValues) => Promise<boolean>; onRemove: (id: number) => Promise<boolean> }) {
  const [values, setValues] = useState<MultiplierValues>({ hourPoints: row.hourPoints, beatenPoints: row.beatenPoints, completedPoints: row.completedPoints });
  const changed = values.hourPoints !== row.hourPoints || values.beatenPoints !== row.beatenPoints || values.completedPoints !== row.completedPoints;
  const field = (key: keyof MultiplierValues, label: string) => <label className="event-field is-compact"><span>{label}</span>
    <input type="number" min={0} max={100} step={0.5} required value={Number.isFinite(values[key]) ? values[key] : ""} onChange={(change) => setValues((current) => ({ ...current, [key]: change.target.valueAsNumber }))}/></label>;
  return <li><form className="event-multiplier" onSubmit={(submit: FormEvent) => { submit.preventDefault(); void onSave(row, values); }}>
    <strong>{row.name}</strong>
    <div className="event-field-row">{field("hourPoints", "Per hour")}{field("beatenPoints", "Beaten")}{field("completedPoints", "100%")}</div>
    <div className="person-actions">{changed && <button type="submit" disabled={busy}>Save</button>}<button type="button" className="secondary" aria-label={`Remove ${row.name}`} title="Remove" disabled={busy} onClick={() => void onRemove(row.id)}><Trash2 size={16} aria-hidden="true"/></button></div>
  </form></li>;
}

type Person = { userId: string; name: string; path: string; label: string };
function PeopleCard({ title, help, action, people, busy, onAdd, onRemove, removeLabel, fixed }: { title: string; help: string; action: string; people: Person[]; busy: boolean;
  onAdd: (displayName: string) => Promise<boolean>; onRemove: (userId: string) => Promise<boolean>; removeLabel: string; fixed?: string }) {
  const [name, setName] = useState("");
  const id = `event-${title.toLowerCase()}`;
  return <section className="settings-card" aria-labelledby={id}><h2 id={id}>{title}</h2><p>{help}</p>
    <form className="friend-form" onSubmit={(submit) => { submit.preventDefault(); void onAdd(name).then((added) => { if (added) setName(""); }); }}>
      <label className="sr-only" htmlFor={`${id}-name`}>Display name</label>
      <input id={`${id}-name`} value={name} maxLength={100} placeholder="Display name" autoComplete="off" onChange={(change) => setName(change.target.value)}/>
      <button type="submit" disabled={busy || !name.trim()}>{action}</button></form>
    {people.map((person) => <div className="person-row" key={person.userId}><div><a className="inline-link" href={person.path}>{person.name}</a>{person.label && <p>{person.label}</p>}</div>
      {person.userId !== fixed && <div className="person-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void onRemove(person.userId)}>{removeLabel}</button></div>}</div>)}
  </section>;
}
