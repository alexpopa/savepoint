// No database here: event dates, permissions, playtime baselines, and scoring are pure so tests can cover them.
import { hasPermission, type PermissionUser } from "./permissions.ts";

export type EventVisibility = "public" | "private";
export type EventStatus = "upcoming" | "live" | "ended";
export type MemberStatus = "invited" | "joined" | "left";
export type Points = { hourPoints: number; beatenPoints: number; completedPoints: number };

export const eventNameLimit = 80;
export const eventDescriptionLimit = 1000;
export const eventRulesLimit = 4000;
// Multipliers are tenths, so 0 to 100 points per hour.
export const maxPoints = 1000;

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
export function validDay(value: unknown): value is string {
  const match = typeof value === "string" ? dayPattern.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && year <= 2100 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
}

// How far the time zone's wall clock is ahead of UTC at a moment.
function zoneOffset(at: number, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - at;
}

// Midnight starting a day in a time zone, in Unix milliseconds. The second pass settles days that change offset.
export function dayStart(day: string, timeZone: string) {
  const [year, month, date] = day.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, date);
  const first = wall - zoneOffset(wall, timeZone);
  return wall - zoneOffset(first, timeZone);
}

export function nextDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

// Whole days: from the start of the first day to the end of the last, in the owner's time zone.
export function eventWindow(startDay: string, endDay: string, timeZone: string) {
  return { startsAt: dayStart(startDay, timeZone), endsAt: dayStart(nextDay(endDay), timeZone) };
}

export function eventStatus(event: { startsAt: number; endsAt: number }, now = Date.now()): EventStatus {
  return now < event.startsAt ? "upcoming" : now < event.endsAt ? "live" : "ended";
}

// Hosts are the owner and co-managers; site admins keep every permission through hasPermission.
export function isEventHost(user: PermissionUser | null, event: { ownerId: string }, hostIds: string[]) {
  return hasPermission(user, user !== null && (event.ownerId === user.userId || hostIds.includes(user.userId)));
}

// Events are for signed-in players only. Private events show only to the people in them.
export function canViewEvent(user: PermissionUser | null, event: { visibility: EventVisibility }, host: boolean, member: MemberStatus | null) {
  return user !== null && hasPermission(user, event.visibility === "public" || host || member !== null);
}

// Until the end, players edit their own event data; afterwards results are locked and only hosts can change them.
export function canEditPlayer(user: PermissionUser, playerId: string, host: boolean, status: EventStatus) {
  return host || (user.userId === playerId && status !== "ended");
}

// Points typed by a host, such as "1.5", to tenths; null when invalid.
export function parsePoints(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const tenths = Math.round(value * 10);
  return Math.abs(tenths - value * 10) < 1e-6 && tenths <= maxPoints ? tenths : null;
}
export const showPoints = (tenths: number) => tenths / 10;

export const maxEventDays = 400;
type SettingsInput = Record<string, unknown>;

// The settings form, checked field by field; returns a sentence for the first problem.
export const maxConsoleMultipliers = 50;
export type ConsoleMultiplier = { platformId: number } & Points;

// A console's own multipliers from the settings form; the server names the console from IGDB.
function parseConsoles(value: unknown): ConsoleMultiplier[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxConsoleMultipliers) return null;
  const consoles: ConsoleMultiplier[] = [];
  for (const entry of value as Record<string, unknown>[]) {
    const platformId = entry?.platformId;
    if (typeof platformId !== "number" || !Number.isSafeInteger(platformId) || platformId < 1 || consoles.some((row) => row.platformId === platformId)) return null;
    const hourPoints = parsePoints(entry.hourPoints), beatenPoints = parsePoints(entry.beatenPoints), completedPoints = parsePoints(entry.completedPoints);
    if (hourPoints === null || beatenPoints === null || completedPoints === null) return null;
    consoles.push({ platformId, hourPoints, beatenPoints, completedPoints });
  }
  return consoles;
}

export function parseEventSettings(input: SettingsInput): { settings: { name: string; description: string; rules: string; visibility: EventVisibility; startDay: string; endDay: string; timeZone: string; consoles: ConsoleMultiplier[] } & Points } | { error: string } {
  const text = (value: unknown, limit: number) => typeof value === "string" && value.length <= limit ? value.trim() : null;
  const name = text(input.name, eventNameLimit), description = text(input.description ?? "", eventDescriptionLimit), rules = text(input.rules ?? "", eventRulesLimit);
  if (!name) return { error: `Name the event in ${eventNameLimit} characters or fewer.` };
  if (description === null) return { error: `Keep the description to ${eventDescriptionLimit} characters.` };
  if (rules === null) return { error: `Keep the rules to ${eventRulesLimit} characters.` };
  if (input.visibility !== "public" && input.visibility !== "private") return { error: "Choose public or private." };
  if (!validDay(input.startDay) || !validDay(input.endDay)) return { error: "Choose a first and last day." };
  if (input.endDay < input.startDay) return { error: "The last day can’t be before the first day." };
  if ((Date.parse(input.endDay) - Date.parse(input.startDay)) / 86400000 >= maxEventDays) return { error: `Keep events under ${maxEventDays} days.` };
  if (!validTimeZone(input.timeZone)) return { error: "Choose a valid time zone." };
  const hourPoints = parsePoints(input.hourPoints), beatenPoints = parsePoints(input.beatenPoints), completedPoints = parsePoints(input.completedPoints);
  if (hourPoints === null || beatenPoints === null || completedPoints === null) return { error: "Multipliers are numbers from 0 to 100, in steps of 0.1." };
  const consoles = parseConsoles(input.consoles);
  if (!consoles) return { error: "Each console can be listed once, with multipliers from 0 to 100." };
  return { settings: { name, description, rules, visibility: input.visibility, startDay: input.startDay, endDay: input.endDay, timeZone: input.timeZone, hourPoints, beatenPoints, completedPoints, consoles } };
}

export type PlaytimeSource = { key: string; minutes: number | null; lastPlayedAt: number | null };
export type Baseline = Record<string, number>;

// What each source adds after the baseline. A source the baseline never saw counts in full when it was played since,
// because it is new; one last played before the baseline counts nothing.
export function minutesSince(baseline: Baseline, baselineAt: number, sources: PlaytimeSource[]) {
  let total = 0;
  for (const source of sources) {
    if (source.minutes === null) continue;
    const start = baseline[source.key] ?? (source.lastPlayedAt !== null && source.lastPlayedAt < baselineAt ? source.minutes : 0);
    total += Math.max(0, source.minutes - start);
  }
  return total;
}

export type EventGameValues = { autoMinutes: number; adjustMinutes: number; autoBeatenAt: number | null; autoCompletedAt: number | null; beaten: boolean | null; completed: boolean | null };

// A completed game also counts as beaten.
export function gameResult(game: EventGameValues) {
  const minutes = Math.max(0, game.autoMinutes + game.adjustMinutes);
  const completed = game.completed ?? game.autoCompletedAt !== null;
  const beaten = completed || (game.beaten ?? game.autoBeatenAt !== null);
  return { minutes, beaten, completed };
}

export type Multiplier = Points & { kind: "platform" | "game"; targetId: number };

// The most specific multiplier wins: the game's, then its platform's, then the event's own.
export function pointsFor(event: Points, multipliers: Multiplier[], game: { igdbId: number; platformId: number }): Points {
  return multipliers.find((entry) => entry.kind === "game" && entry.targetId === game.igdbId)
    ?? multipliers.find((entry) => entry.kind === "platform" && entry.targetId === game.platformId)
    ?? event;
}

// Every hour scores the hour multiplier, plus the beaten and completed multipliers once the game reaches them.
export function gameScore(points: Points, result: { minutes: number; beaten: boolean; completed: boolean }) {
  const tenths = points.hourPoints + (result.beaten ? points.beatenPoints : 0) + (result.completed ? points.completedPoints : 0);
  return result.minutes * tenths / 600;
}

export type Standing = { userId: string; score: number; minutes: number; beaten: number; completed: number; games: number };
export type ScoredGame = EventGameValues & { userId: string; igdbId: number; platformId: number; removed: boolean };

export function leaderboard(event: Points, multipliers: Multiplier[], players: { userId: string; name: string }[], games: ScoredGame[]): (Standing & { name: string; rank: number })[] {
  const standings = new Map(players.map((player) => [player.userId, { userId: player.userId, name: player.name, score: 0, minutes: 0, beaten: 0, completed: 0, games: 0 }]));
  for (const game of games) {
    const standing = standings.get(game.userId);
    if (!standing || game.removed) continue;
    const result = gameResult(game);
    standing.score += gameScore(pointsFor(event, multipliers, game), result);
    standing.minutes += result.minutes;
    standing.beaten += Number(result.beaten);
    standing.completed += Number(result.completed);
    standing.games += 1;
  }
  const rows = [...standings.values()].map((row) => ({ ...row, score: Math.round(row.score * 10) / 10 }))
    .sort((a, b) => b.score - a.score || b.beaten - a.beaten || a.name.localeCompare(b.name));
  // Equal scores and beaten counts share a rank.
  return rows.map((row, index) => ({ ...row, rank: rows.findIndex((other) => other.score === row.score && other.beaten === row.beaten) + 1 || index + 1 }));
}

// "Jan 1 – Jan 31, 2027"; days are calendar dates, so they print in UTC to stay the owner's days.
export function eventDays(startDay: string, endDay: string) {
  const format = (day: string, year: boolean) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year && { year: "numeric" }), timeZone: "UTC" });
  if (startDay === endDay) return format(startDay, true);
  return `${format(startDay, startDay.slice(0, 4) !== endDay.slice(0, 4))} – ${format(endDay, true)}`;
}

export const statusLabels: Record<EventStatus, string> = { upcoming: "Upcoming", live: "Live", ended: "Ended" };
