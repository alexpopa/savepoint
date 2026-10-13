import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, eventGames, eventHosts, eventMembers, eventMultipliers, events, libraryItems, psnConnections, raConnections, steamConnections, xboxConnections } from "../db/schema";
import type { AppUser } from "../app/auth";
import {
  acceptEventInvite, addEventGame, copyEvent, copyEventMultipliers, eventPlaytimeSources, inviteToEvent, joinEvent,
  saveEventBaseline, acceptEventGame, eventReviewSources, visibleEventsQuery,
} from "./event-queries";
import {
  canEditPlayer, canViewEvent, eventStatus, eventWindow, gameResult, gameScore, isEventHost, leaderboard, minutesSince, pointsFor, showPoints,
  type Baseline, type ConsoleMultiplier, type EventStatus, type EventVisibility, type MemberStatus, type Multiplier, type PlaytimeSource, type Points,
} from "./event-rules";
import { getIgdbGame, listIgdbPlatforms } from "./igdb";
import { hasPermission } from "./permissions";
import { profilePath } from "./profile-path";
import { accountDisplayName, getFriendship } from "./social";
import { addPsnGame, matchPsnGames, refreshPsn, syncPsnTrophies } from "./psn";
import { addRaGame, matchRaGames, refreshRa, syncRaAchievements } from "./ra";
import { matchSteamGames, refreshSteam, resolveSteamGame } from "./steam";
import { addXboxGame, matchXboxGames, refreshXbox, syncXboxAchievements } from "./xbox";

import { defaultSteamPlatform } from "./steam-types";
import { defaultXboxPlatform } from "./xbox-types";
import { defaultPsnPlatform } from "./psn-types";
import { defaultRaPlatform } from "./ra-types";
import { eventChange, type EventChange } from "./event-review";
import type { CatalogGame } from "./game-types";

export class EventError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

type EventRow = typeof events.$inferSelect;
export type EventSettings = { name: string; description: string; rules: string; visibility: EventVisibility; startDay: string; endDay: string; timeZone: string; consoles: ConsoleMultiplier[] } & Points;
export type EventPerson = { userId: string; name: string; path: string };
export type EventGameView = {
  id: number; userId: string; libraryItemId: number | null; igdbId: number; platformId: number; platformName: string | null; name: string; coverUrl: string | null;
  minutes: number; autoMinutes: number; beaten: boolean; completed: boolean; autoBeaten: boolean; autoCompleted: boolean; achievements: number; points: number;
};
export type EventSummary = { id: number; name: string; description: string; visibility: EventVisibility; startDay: string; endDay: string; startsAt: number; endsAt: number;
  status: EventStatus; memberStatus: MemberStatus | null; hosting: boolean; players: number };
export type EventDetail = {
  event: Omit<EventSettings, keyof Points | "consoles"> & Points & { id: number; startsAt: number; endsAt: number; status: EventStatus };
  owner: EventPerson; hosts: EventPerson[]; invited: EventPerson[];
  multipliers: (Multiplier & { id: number; name: string; coverUrl: string | null })[];
  viewer: { userId: string; host: boolean; owner: boolean; canCopy: boolean; privateProfile: boolean; member: { status: MemberStatus; baselineAt: number | null; updatedAt: number | null } | null };
  standings: ReturnType<typeof leaderboard>;
  games: EventGameView[];
};

const verified = and(isNotNull(accounts.passwordHash), isNotNull(accounts.emailVerifiedAt));
const toPoints = (row: Points): Points => ({ hourPoints: showPoints(row.hourPoints), beatenPoints: showPoints(row.beatenPoints), completedPoints: showPoints(row.completedPoints) });

async function loadEvent(id: number) {
  const db = getDb();
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) return null;
  const hosts = await db.select({ userId: eventHosts.userId }).from(eventHosts).where(eq(eventHosts.eventId, id));
  return { event, hostIds: hosts.map((row) => row.userId) };
}

// Loads an event the viewer may see, with the viewer's host and member state.
async function access(user: AppUser, id: number) {
  const loaded = await loadEvent(id);
  if (!loaded) throw new EventError("This event no longer exists.", 404);
  const [member] = await getDb().select().from(eventMembers).where(and(eq(eventMembers.eventId, id), eq(eventMembers.userId, user.userId)));
  const host = isEventHost(user, loaded.event, loaded.hostIds);
  if (!canViewEvent(user, loaded.event, host, member?.status ?? null)) throw new EventError("This event is private.", 404);
  return { ...loaded, member: member ?? null, host, status: eventStatus(loaded.event) };
}

function requireHost(context: { host: boolean }) {
  if (!context.host) throw new EventError("Only the event's hosts can change this.", 403);
}

export async function getEventList(user: AppUser): Promise<EventSummary[]> {
  const { results } = await getDb().$client.prepare(visibleEventsQuery).bind(user.userId, user.isAdmin ? 1 : 0)
    .all<Omit<EventSummary, "status" | "hosting"> & { hosting: number }>();
  return results.map((row) => ({ ...row, hosting: Boolean(row.hosting), status: eventStatus(row) }));
}

export async function getEventDetail(user: AppUser, id: number): Promise<EventDetail> {
  const { event, hostIds, member, host, status } = await access(user, id);
  const db = getDb();
  const [people, multipliers, games, viewerAccount] = await Promise.all([
    db.select({ userId: eventMembers.userId, status: eventMembers.status, displayName: accounts.displayName, email: accounts.email }).from(eventMembers)
      .innerJoin(accounts, and(eq(accounts.userId, eventMembers.userId), verified)).where(eq(eventMembers.eventId, id)),
    db.select().from(eventMultipliers).where(eq(eventMultipliers.eventId, id)),
    db.select().from(eventGames).where(and(eq(eventGames.eventId, id), eq(eventGames.removed, false))),
    db.select({ isPublic: accounts.isPublic }).from(accounts).where(eq(accounts.userId, user.userId)),
  ]);
  const staff = await db.select({ userId: accounts.userId, displayName: accounts.displayName, email: accounts.email }).from(accounts).where(inArray(accounts.userId, [event.ownerId, ...hostIds]));
  const person = (row: { userId: string; displayName: string; email: string }) => ({ userId: row.userId, name: accountDisplayName(row), path: profilePath(row) });
  const joined = people.filter((row) => row.status === "joined").map(person);
  const joinedIds = new Set(joined.map((row) => row.userId));
  const rules = multipliers.map((row) => ({ ...row, kind: row.kind as Multiplier["kind"] }));
  const scored = games.filter((game) => joinedIds.has(game.userId)).map((game) => ({ ...game, beaten: game.beaten, completed: game.completed }));
  const owner = staff.find((row) => row.userId === event.ownerId);
  return {
    event: { id: event.id, name: event.name, description: event.description, rules: event.rules, visibility: event.visibility, startDay: event.startDay, endDay: event.endDay,
      timeZone: event.timeZone, startsAt: event.startsAt, endsAt: event.endsAt, status, ...toPoints(event) },
    owner: owner ? person(owner) : { userId: event.ownerId, name: "Unknown player", path: "/users" },
    hosts: staff.filter((row) => row.userId !== event.ownerId).map(person),
    invited: host ? people.filter((row) => row.status === "invited").map(person) : [],
    multipliers: rules.map((row) => ({ id: row.id, kind: row.kind, targetId: row.targetId, name: row.name, coverUrl: row.coverUrl, ...toPoints(row) })),
    viewer: { userId: user.userId, host, owner: event.ownerId === user.userId, canCopy: hasPermission(user, false), privateProfile: !viewerAccount[0]?.isPublic,
      member: member ? { status: member.status, baselineAt: member.baselineAt, updatedAt: member.updatedAt } : null },
    standings: leaderboard(event, rules, joined, scored),
    games: scored.map((game) => {
      const result = gameResult(game);
      return { id: game.id, userId: game.userId, libraryItemId: game.libraryItemId, igdbId: game.igdbId, platformId: game.platformId, platformName: game.platformName, name: game.name,
        coverUrl: game.coverUrl, minutes: result.minutes, autoMinutes: game.autoMinutes, beaten: result.beaten, completed: result.completed, autoBeaten: game.autoBeatenAt !== null,
        autoCompleted: game.autoCompletedAt !== null, achievements: game.achievements, points: Math.round(gameScore(pointsFor(event, rules, game), result) * 10) / 10 };
    }).sort((a, b) => b.points - a.points || b.minutes - a.minutes || a.name.localeCompare(b.name)),
  };
}

// Only site admins create events for now; opening this to every player is `hasPermission(user, true)`.
export async function createEvent(user: AppUser, settings: EventSettings) {
  if (!hasPermission(user, false)) throw new EventError("Only site admins can create events for now.", 403);
  const consoles = await namedConsoles(settings.consoles);
  const [created] = await getDb().insert(events).values({ ownerId: user.userId, ...settingsRow(settings), createdAt: Date.now() }).returning({ id: events.id });
  await saveConsoles(created.id, consoles);
  return created.id;
}

function settingsRow({ name, description, rules, visibility, startDay, endDay, timeZone, hourPoints, beatenPoints, completedPoints }: EventSettings) {
  return { name, description, rules, visibility, startDay, endDay, timeZone, hourPoints, beatenPoints, completedPoints, ...eventWindow(startDay, endDay, timeZone) };
}

// Console names come from IGDB's catalog, never from the form.
async function namedConsoles(consoles: ConsoleMultiplier[]) {
  if (!consoles.length) return [];
  const catalog = new Map((await listIgdbPlatforms()).map((platform) => [platform.id, platform.name]));
  return consoles.map((entry) => {
    const name = catalog.get(entry.platformId);
    if (!name) throw new EventError("Choose consoles from the list.");
    return { ...entry, name };
  });
}

// The form holds the whole console list, so saving replaces it; game multipliers are kept.
async function saveConsoles(eventId: number, consoles: (ConsoleMultiplier & { name: string })[]) {
  const db = getDb();
  await db.batch([
    db.delete(eventMultipliers).where(and(eq(eventMultipliers.eventId, eventId), eq(eventMultipliers.kind, "platform"))),
    ...consoles.map(({ platformId, ...entry }) => db.insert(eventMultipliers).values({ eventId, kind: "platform", targetId: platformId, coverUrl: null, ...entry })),
  ]);
}

export async function copyEventFor(user: AppUser, id: number) {
  await access(user, id);
  if (!hasPermission(user, false)) throw new EventError("Only site admins can copy events for now.", 403);
  const client = getDb().$client;
  const copied = await client.prepare(copyEvent).bind(id, user.userId, Date.now()).first<{ id: number }>();
  if (!copied) throw new EventError("This event no longer exists.", 404);
  await client.prepare(copyEventMultipliers).bind(id, copied.id).run();
  return copied.id;
}

type Action = { action: string; [key: string]: unknown };

// Every event change goes through here; the route has already checked the payload's shape.
export async function runEventAction(user: AppUser, id: number, input: Action): Promise<string> {
  const context = await access(user, id);
  const { event, member, status } = context;
  const db = getDb();
  const client = db.$client;
  const now = Date.now();
  switch (input.action) {
    case "join": {
      if (status === "ended") throw new EventError("This event has ended.", 409);
      if (member?.status === "joined") return "You’re in.";
      const saved = event.visibility === "public" || context.host ? await client.prepare(joinEvent).bind(id, user.userId, now, context.host ? 1 : 0).run()
        : await client.prepare(acceptEventInvite).bind(id, user.userId, now).run();
      if (!saved.meta.changes) throw new EventError("This event is invite only.", 403);
      // Joining after the start is the first visit, so the baseline is taken now.
      if (status === "live") return await baselineMember(user.userId, event);
      return "You’re in.";
    }
    case "decline":
      await db.delete(eventMembers).where(and(eq(eventMembers.eventId, id), eq(eventMembers.userId, user.userId), eq(eventMembers.status, "invited")));
      return "Invitation declined.";
    case "leave":
      await db.update(eventMembers).set({ status: "left" }).where(and(eq(eventMembers.eventId, id), eq(eventMembers.userId, user.userId), eq(eventMembers.status, "joined")));
      return "You left the event. Your games are kept if you rejoin.";
    case "baseline": {
      if (member?.status !== "joined" || status !== "live") throw new EventError("Join this event while it is running first.", 409);
      if (member.baselineAt) return "Your starting point is already set.";
      return await baselineMember(user.userId, event);
    }
    case "add-game": {
      ownGame(context);
      const libraryItemId = input.libraryItemId as number;
      const saved = await client.prepare(addEventGame).bind(id, user.userId, libraryItemId, now).run();
      if (!saved.meta.changes) throw new EventError("Choose a game from your library.", 404);
      return "Game added.";
    }
    case "edit-game": {
      const [game] = await db.select().from(eventGames).where(and(eq(eventGames.id, input.gameId as number), eq(eventGames.eventId, id)));
      if (!game) throw new EventError("This game is no longer in the event.", 404);
      if (!canEditPlayer(user, game.userId, context.host, status)) throw new EventError(status === "ended" ? "Results are locked. Ask a host to change them." : "You can only edit your own games.", 403);
      const minutes = input.minutes as number;
      const beaten = input.beaten as boolean, completed = input.completed as boolean;
      const auto = { beaten: game.autoBeatenAt !== null || game.autoCompletedAt !== null, completed: game.autoCompletedAt !== null };
      // Matching the accepted source value clears the override; new readings still require approval.
      await db.update(eventGames).set({ adjustMinutes: minutes - game.autoMinutes, beaten: beaten === auto.beaten ? null : beaten, completed: completed === auto.completed ? null : completed })
        .where(eq(eventGames.id, game.id));
      return "Saved.";
    }
    case "reset-game":
    case "remove-game": {
      const [game] = await db.select().from(eventGames).where(and(eq(eventGames.id, input.gameId as number), eq(eventGames.eventId, id)));
      if (!game) throw new EventError("This game is no longer in the event.", 404);
      if (!canEditPlayer(user, game.userId, context.host, status)) throw new EventError("Results are locked. Ask a host to change them.", 403);
      await db.update(eventGames).set(input.action === "reset-game" ? { adjustMinutes: 0, beaten: null, completed: null } : { removed: true }).where(eq(eventGames.id, game.id));
      return input.action === "reset-game" ? "Back to the automatic values." : "Removed from the event.";
    }
    case "settings": {
      requireHost(context);
      const settings = input.settings as EventSettings;
      const consoles = await namedConsoles(settings.consoles);
      await db.update(events).set(settingsRow(settings)).where(eq(events.id, id));
      await saveConsoles(id, consoles);
      return "Event saved.";
    }
    case "set-multiplier": {
      requireHost(context);
      const values = input.multiplier as { kind: "game"; targetId: number } & Points;
      const game = await getIgdbGame(values.targetId);
      if (!game) throw new EventError("Choose a game from the catalog.", 404);
      await db.insert(eventMultipliers).values({ eventId: id, ...values, name: game.name, coverUrl: game.coverUrl }).onConflictDoUpdate({
        target: [eventMultipliers.eventId, eventMultipliers.kind, eventMultipliers.targetId],
        set: { hourPoints: values.hourPoints, beatenPoints: values.beatenPoints, completedPoints: values.completedPoints, name: game.name, coverUrl: game.coverUrl },
      });
      return "Multiplier saved.";
    }
    case "remove-multiplier":
      requireHost(context);
      await db.delete(eventMultipliers).where(and(eq(eventMultipliers.eventId, id), eq(eventMultipliers.id, input.multiplierId as number)));
      return "Multiplier removed.";
    case "add-host":
    case "invite": {
      requireHost(context);
      const target = await findPlayer(user, input.displayName as string);
      if (input.action === "add-host") {
        if (target.userId === event.ownerId) return `${target.name} owns this event.`;
        await db.insert(eventHosts).values({ eventId: id, userId: target.userId }).onConflictDoNothing();
        return `${target.name} is now a host.`;
      }
      await client.prepare(inviteToEvent).bind(id, target.userId, user.userId, now).run();
      return `${target.name} is invited.`;
    }
    case "remove-host":
      requireHost(context);
      await db.delete(eventHosts).where(and(eq(eventHosts.eventId, id), eq(eventHosts.userId, input.userId as string)));
      return "Host removed.";
    case "uninvite":
      requireHost(context);
      await db.delete(eventMembers).where(and(eq(eventMembers.eventId, id), eq(eventMembers.userId, input.userId as string), eq(eventMembers.status, "invited")));
      return "Invitation withdrawn.";
    default:
      throw new EventError("Choose a valid event action.");
  }
}

function ownGame(context: { member: { status: MemberStatus } | null; status: EventStatus }) {
  if (context.member?.status !== "joined") throw new EventError("Join this event first.", 409);
  if (context.status === "ended") throw new EventError("Results are locked. Ask a host to change them.", 403);
}

// Hosts invite and add their friends; site admins can choose any verified player.
async function findPlayer(user: AppUser, displayName: string) {
  const [target] = await getDb().select({ userId: accounts.userId, displayName: accounts.displayName, email: accounts.email }).from(accounts)
    .where(and(sql`lower(${accounts.displayName}) = lower(${displayName.trim()})`, verified));
  const friendship = target && target.userId !== user.userId ? await getFriendship(user.userId, target.userId) : null;
  if (!target || !hasPermission(user, target.userId === user.userId || friendship?.status === "accepted")) throw new EventError("Choose one of your friends by display name.", 404);
  return { userId: target.userId, name: accountDisplayName(target) };
}

function listNames(names: string[]) { return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`; }

// Refreshes every connected service, then reads one batch of achievements where each service needs it.
// A service that cannot refresh right now (its five-minute limit, an expired sign-in) still counts with its saved data.
async function refreshServices(userId: string) {
  const db = getDb();
  const [steam, xbox, psn, ra] = await db.batch([
    db.select({ id: steamConnections.userId }).from(steamConnections).where(eq(steamConnections.userId, userId)),
    db.select({ id: xboxConnections.userId }).from(xboxConnections).where(eq(xboxConnections.userId, userId)),
    db.select({ id: psnConnections.userId }).from(psnConnections).where(eq(psnConnections.userId, userId)),
    db.select({ id: raConnections.userId }).from(raConnections).where(eq(raConnections.userId, userId)),
  ]);
  const services = [
    { name: "Steam", connected: steam.length > 0, run: () => refreshSteam(userId) },
    { name: "Xbox", connected: xbox.length > 0, run: () => refreshXbox(userId).then(() => syncXboxAchievements(userId, true).catch(() => {})) },
    { name: "PlayStation", connected: psn.length > 0, run: () => refreshPsn(userId).then(() => syncPsnTrophies(userId, true).catch(() => {})) },
    { name: "RetroAchievements", connected: ra.length > 0, run: () => refreshRa(userId).then(() => syncRaAchievements(userId, true).catch(() => {})) },
  ].filter((service) => service.connected);
  const results = await Promise.allSettled(services.map((service) => service.run()));
  return { refreshed: services.filter((_, index) => results[index].status === "fulfilled").map((service) => service.name),
    saved: services.filter((_, index) => results[index].status === "rejected").map((service) => service.name) };
}

function updatedFrom({ refreshed, saved }: { refreshed: string[]; saved: string[] }) {
  if (!refreshed.length && !saved.length) return "from your library";
  return [refreshed.length ? `from ${listNames(refreshed)}` : "", saved.length ? `with the last saved data from ${listNames(saved)}` : ""].filter(Boolean).join(", and ");
}

async function playtimeSources(userId: string) {
  const { results } = await getDb().$client.prepare(eventPlaytimeSources).bind(userId).all<PlaytimeSource & { libraryItemId: number | null }>();
  return results;
}

async function baselineMember(userId: string, event: EventRow) {
  const refreshed = await refreshServices(userId);
  const now = Date.now();
  const baseline: Baseline = {};
  for (const source of await playtimeSources(userId)) if (source.minutes !== null) baseline[source.key] = source.minutes;
  const json = JSON.stringify(baseline);
  await getDb().$client.prepare(saveEventBaseline).bind(event.id, userId, now, json).run();
  return `Your starting point is set ${updatedFrom(refreshed)}. Time played from now on counts.`;
}

type ReviewSource = PlaytimeSource & { name: string; gameJson: string | null; libraryItemId: number | null; platformsJson: string; consoleId: number | null;
  beatenAt: number | null; completedAt: number | null; achievements: number };

async function memberReview(userId: string, event: EventRow, baselineAt: number, baselineJson: string | null): Promise<EventChange[]> {
  const db = getDb();
  const [sources, copies, saved] = await Promise.all([
    db.$client.prepare(eventReviewSources).bind(userId, event.startsAt, event.endsAt).all<ReviewSource>().then((result) => result.results),
    db.select().from(libraryItems).where(eq(libraryItems.userId, userId)),
    db.select().from(eventGames).where(and(eq(eventGames.eventId, event.id), eq(eventGames.userId, userId))),
  ]);
  const baseline = JSON.parse(baselineJson ?? "{}") as Baseline;
  type Group = { igdbId: number | null; platformId: number; platformName: string | null; libraryItemId: number | null; name: string; coverUrl: string | null; sources: ReviewSource[]; beatenAt: number | null };
  const groups = new Map<string, Group>();
  for (const copy of copies) groups.set(`${copy.igdbId}:${copy.platformId}`, { ...copy, libraryItemId: copy.id, sources: [], beatenAt: copy.completedAt !== null && copy.completedAt >= event.startsAt && copy.completedAt < event.endsAt ? copy.completedAt : null });
  for (const source of sources) {
    const linked = copies.find((copy) => copy.id === source.libraryItemId);
    const game = source.gameJson ? JSON.parse(source.gameJson) as CatalogGame : null;
    const platforms = copies.filter((copy) => copy.igdbId === game?.igdbId).map((copy) => copy.platformId);
    const service = source.key.split(":")[0];
    const platformId = linked?.platformId ?? (game ? service === "steam" ? defaultSteamPlatform(game, platforms)
      : service === "xbox" ? defaultXboxPlatform(game, JSON.parse(source.platformsJson), platforms)
      : service === "psn" ? defaultPsnPlatform(game, JSON.parse(source.platformsJson), platforms)
      : defaultRaPlatform(game, source.consoleId ?? 0, platforms) : 0);
    const igdbId = linked?.igdbId ?? (platformId ? game?.igdbId ?? null : null);
    const key = igdbId === null ? source.key : `${igdbId}:${platformId}`;
    if (!groups.has(key)) groups.set(key, { igdbId, platformId, platformName: game?.platformOptions.find((p) => p.id === platformId)?.name ?? null,
      libraryItemId: null, name: game?.name ?? source.name, coverUrl: game?.coverUrl ?? null, sources: [], beatenAt: null });
    groups.get(key)!.sources.push(source);
  }
  const first = (values: (number | null)[]) => values.reduce<number | null>((a, b) => b === null ? a : a === null ? b : Math.min(a, b), null);
  return [...groups].flatMap(([key, group]) => {
    const existing = saved.find((row) => row.igdbId === group.igdbId && row.platformId === group.platformId);
    const reading = { autoMinutes: minutesSince(baseline, baselineAt, group.sources), autoBeatenAt: first([group.beatenAt, ...group.sources.map((s) => s.beatenAt)]),
      autoCompletedAt: first(group.sources.map((s) => s.completedAt)), achievements: group.sources.reduce((sum, s) => sum + s.achievements, 0) };
    const played = group.sources.some((source) => source.lastPlayedAt !== null && source.lastPlayedAt >= baselineAt && source.lastPlayedAt < event.endsAt);
    const change = eventChange(reading, existing, played);
    return change ? [{ ...change, timeKnown: group.sources.some((source) => source.minutes !== null), key, igdbId: group.igdbId, platformId: group.platformId, platformName: group.platformName, libraryItemId: group.libraryItemId,
      name: group.name, coverUrl: group.coverUrl, sources: group.sources.map((s) => s.key) }] : [];
  }).sort((a, b) => Number(a.previous !== null) - Number(b.previous !== null) || a.name.localeCompare(b.name));
}

async function reviewContext(user: AppUser, id: number) {
  const context = await access(user, id);
  if (context.member?.status !== "joined") throw new EventError("Join this event first.", 409);
  if (context.status !== "live") throw new EventError(context.status === "ended" ? "This event has ended. Results are locked." : "This event hasn’t started yet.", 409);
  if (!context.member.baselineAt) await baselineMember(user.userId, context.event);
  const current = await access(user, id);
  return { event: current.event, member: current.member! };
}

export async function reviewEvent(user: AppUser, id: number) {
  const { event, member } = await reviewContext(user, id);
  const refreshed = await refreshServices(user.userId);
  // Matching offers a catalog choice; it doesn't add anything until the player accepts.
  await Promise.allSettled([matchSteamGames(user.userId), matchXboxGames(user.userId), matchPsnGames(user.userId), matchRaGames(user.userId)]);
  const changes = await memberReview(user.userId, event, member.baselineAt!, member.baselineJson);
  return { changes, message: changes.length ? `Changes ready to review ${updatedFrom(refreshed)}.` : `No new changes ${updatedFrom(refreshed)}.` };
}

async function importSource(userId: string, key: string, igdbId: number) {
  const colon = key.indexOf(":");
  const service = key.slice(0, colon), sourceId = key.slice(colon + 1);
  try {
    if (service === "steam") await resolveSteamGame(userId, Number(sourceId), igdbId);
    else if (service === "xbox") await addXboxGame(userId, Number(sourceId), igdbId, false);
    else if (service === "psn") await addPsnGame(userId, sourceId, igdbId, false);
    else if (service === "ra") await addRaGame(userId, Number(sourceId), igdbId, false);
    else throw new EventError("Choose a connected game.");
  } catch (error) { if (error instanceof Error && "status" in error) throw new EventError(error.message, Number(error.status)); throw error; }
}

export async function acceptEventChanges(user: AppUser, id: number, selections: { key: string; signature: string; igdbId?: number }[]) {
  const { event, member } = await reviewContext(user, id);
  let changes = await memberReview(user.userId, event, member.baselineAt!, member.baselineJson);
  const approved = selections.map((selection) => {
    const change = changes.find((row) => row.key === selection.key);
    if (!change || change.signature !== selection.signature) throw new EventError("These changes have changed. Press Update to review them again.", 409);
    if (change.igdbId === null && !selection.igdbId) throw new EventError("Find a match for this game first.");
    return { change, igdbId: change.igdbId ?? selection.igdbId! };
  });
  let accepted = 0;
  for (const { change, igdbId } of approved) {
    const sources = await getDb().$client.prepare(eventReviewSources).bind(user.userId, event.startsAt, event.endsAt).all<ReviewSource>();
    const unlinked = sources.results.filter((row) => change.sources.includes(row.key) && row.libraryItemId === null);
    if (unlinked.length) {
      for (const source of unlinked) await importSource(user.userId, source.key, igdbId);
      changes = await memberReview(user.userId, event, member.baselineAt!, member.baselineJson);
    }
    const current = changes.find((row) => row.key === change.key || (change.igdbId === null && row.sources.some((key) => change.sources.includes(key))));
    if (!current?.libraryItemId || current.igdbId === null) throw new EventError("This game could not be added. Press Update and try again.", 409);
    if (change.igdbId !== null && current.signature !== change.signature) throw new EventError("This game changed while you reviewed it. Press Update and try again.", 409);
    const game = await getIgdbGame(current.igdbId);
    if (!game) throw new EventError("That game is not available in IGDB.", 404);
    const before = JSON.parse(current.signature)[1];
    // Use the reviewed result; only matching an unresolved title changes the catalog identity.
    const result = await getDb().$client.prepare(acceptEventGame).bind(id, user.userId, current.libraryItemId, current.igdbId, current.platformId,
      current.platformName, game.name, game.coverUrl, current.reading.autoMinutes, current.reading.autoBeatenAt, current.reading.autoCompletedAt,
      current.reading.achievements, Date.now(), current.next.minutes - current.reading.autoMinutes, current.next.beaten ? 1 : 0, current.next.completed ? 1 : 0,
      before === null ? null : JSON.stringify(before.map((value: unknown) => typeof value === "boolean" ? Number(value) : value))).run();
    if (!result.meta.changes) throw new EventError("This game changed while you reviewed it. Press Update and try again.", 409);
    await getDb().update(eventMembers).set({ updatedAt: Date.now() }).where(and(eq(eventMembers.eventId, id), eq(eventMembers.userId, user.userId)));
    accepted++;
  }
  return { changes: await memberReview(user.userId, event, member.baselineAt!, member.baselineJson), message: `Accepted ${accepted} ${accepted === 1 ? "game" : "games"}.` };
}
