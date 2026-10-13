// No database here, so the library, profiles, and events share one reading of a copy's time played.
export type Playtime = {
  // What the copy shows: the player's own time, otherwise their connected services' total.
  minutes: number | null;
  // Set while the player's own time is shown; empty when it follows the services.
  own: number | null;
  // The services' total and their names, for "Steam says 20 h".
  source: { minutes: number; names: string } | null;
};

export function readPlaytime(own: number | null, sourceMinutes: number | null, sourceNames: string | null): Playtime {
  const source = sourceMinutes === null ? null : { minutes: sourceMinutes, names: sourceNames || "Your connected services" };
  return { minutes: own ?? source?.minutes ?? null, own, source };
}

export function formatHours(minutes: number) {
  return `${(minutes / 60).toLocaleString("en-US", { maximumFractionDigits: 1 })} h`;
}

export const maxPlayMinutes = 100000 * 60;

// Hours typed by the player, such as "12.5", to whole minutes; null for an empty field, NaN when invalid.
export function parseHours(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d{1,6}(\.\d{0,2})?$/.test(text)) return NaN;
  const minutes = Math.round(Number(text) * 60);
  return minutes <= maxPlayMinutes ? minutes : NaN;
}

export function hoursInput(minutes: number | null) {
  return minutes === null ? "" : String(Math.round(minutes / 6) / 10);
}
