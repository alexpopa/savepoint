import { gameResult, type EventGameValues } from "./event-rules.ts";

export type EventReading = { autoMinutes: number; autoBeatenAt: number | null; autoCompletedAt: number | null; achievements: number };
export type SavedEventReading = EventReading & EventGameValues & { id: number; removed: boolean };
export type EventChange = {
  key: string; signature: string; igdbId: number | null; platformId: number; platformName: string | null;
  libraryItemId: number | null; name: string; coverUrl: string | null; sources: string[];
  previous: { minutes: number; beaten: boolean; completed: boolean; achievements: number } | null;
  next: { minutes: number; beaten: boolean; completed: boolean; achievements: number };
  reading: EventReading; timeKnown: boolean;
};

// Compare with the last accepted source readings, so rejected proposals return and manual changes aren't lost.
export function eventChange(reading: EventReading, saved?: SavedEventReading, played = false) {
  if (saved?.removed) return null;
  const previous = saved ? { ...gameResult(saved), achievements: saved.achievements } : null;
  const next = {
    minutes: Math.max(0, reading.autoMinutes),
    completed: reading.autoCompletedAt !== (saved?.autoCompletedAt ?? null) ? reading.autoCompletedAt !== null : (saved?.completed ?? reading.autoCompletedAt !== null),
    beaten: reading.autoBeatenAt !== (saved?.autoBeatenAt ?? null) ? reading.autoBeatenAt !== null : (saved?.beaten ?? reading.autoBeatenAt !== null),
    achievements: reading.achievements,
  };
  next.beaten ||= next.completed;
  if (!saved && !played && !next.minutes && !next.beaten && !next.completed && !next.achievements) return null;
  if (saved && reading.autoMinutes === saved.autoMinutes && reading.autoBeatenAt === saved.autoBeatenAt && reading.autoCompletedAt === saved.autoCompletedAt && reading.achievements === saved.achievements) return null;
  return { previous, next, reading, signature: JSON.stringify([reading, saved ? [saved.id, saved.autoMinutes, saved.adjustMinutes, saved.autoBeatenAt, saved.autoCompletedAt, saved.beaten, saved.completed, saved.achievements] : null]) };
}
