import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, eventGames, eventHosts, eventMembers, eventMultipliers, events, libraryItems, psnConnections, raConnections, steamConnections, xboxConnections } from "../db/schema";
import type { AppUser } from "../app/auth";
import {
  acceptEventInvite, addEventGame, copyEvent, copyEventMultipliers, eventAchievements, eventCompletions, eventPlaytimeSources, inviteToEvent, joinEvent,
  saveEventBaseline, saveEventGame, visibleEventsQuery,
} from "./event-queries";
import {
  canEditPlayer, canViewEvent, eventStatus, eventWindow, gameResult, gameScore, isEventHost, leaderboard, minutesSince, pointsFor, showPoints,
  type Baseline, type ConsoleMultiplier, type EventStatus, type EventVisibility, type MemberStatus, type Multiplier, type PlaytimeSource, type Points,
} from "./event-rules";
import { getIgdbGame, listIgdbPlatforms } from "./igdb";
import { hasPermission } from "./permissions";
import { profilePath } from "./profile-path";
import { accountDisplayName, getFriendship } from "./social";
import { refreshPsn, syncPsnTrophies } from "./psn";
import { refreshRa, syncRaAchievements } from "./ra";
import { refreshSteam } from "./steam";
import { refreshXbox, syncXboxAchievements } from "./xbox";

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
    case "update": {
      if (member?.status !== "joined") throw new EventError("Join this event first.", 409);
      if (status !== "live") throw new EventError(status === "ended" ? "This event has ended. Results are locked." : "This event hasn’t started yet.", 409);
      if (!member.baselineAt) return await baselineMember(user.userId, event);
      const refreshed = await refreshServices(user.userId);
      await computeMember(user.userId, event, member.baselineAt, member.baselineJson);
      return `Updated ${updatedFrom(refreshed)}.`;
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
      // Matching the automatic value clears the edit, so later updates can change it again.
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
      await db.insert(eventMultipliers).values({ eventId: id, ...values }).onConflictDoUpdate({
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
    { name: "Xbox", connected: xbox.length > 0, run: () => refreshXbox(userId).then(() => syncXboxAchievements(userId).catch(() => {})) },
    { name: "PlayStation", connected: psn.length > 0, run: () => refreshPsn(userId).then(() => syncPsnTrophies(userId).catch(() => {})) },
    { name: "RetroAchievements", connected: ra.length > 0, run: () => refreshRa(userId).then(() => syncRaAchievements(userId).catch(() => {})) },
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
  await computeMember(userId, event, now, json);
  return `Your starting point is set ${updatedFrom(refreshed)}. Time played from now on counts.`;
}

// Recomputes the automatic values of every library copy played, beaten, completed, or unlocked during the event.
async function computeMember(userId: string, event: EventRow, baselineAt: number, baselineJson: string | null) {
  const db = getDb();
  const client = db.$client;
  const baseline = JSON.parse(baselineJson ?? "{}") as Baseline;
  const [sources, completions, achievements, copies, existing] = await Promise.all([
    playtimeSources(userId),
    client.prepare(eventCompletions).bind(userId, event.startsAt, event.endsAt).all<{ libraryItemId: number; stage: "beaten" | "completed"; at: number }>().then((result) => result.results),
    client.prepare(eventAchievements).bind(userId, event.startsAt, event.endsAt).all<{ libraryItemId: number; earned: number }>().then((result) => result.results),
    db.select().from(libraryItems).where(eq(libraryItems.userId, userId)),
    db.select({ igdbId: eventGames.igdbId, platformId: eventGames.platformId }).from(eventGames).where(and(eq(eventGames.eventId, event.id), eq(eventGames.userId, userId))),
  ]);
  const first = (copyId: number, stage: string) => completions.filter((row) => row.libraryItemId === copyId && row.stage === stage).reduce<number | null>((at, row) => at === null || row.at < at ? row.at : at, null);
  const statements = copies.flatMap((copy) => {
    const minutes = minutesSince(baseline, baselineAt, sources.filter((source) => source.libraryItemId === copy.id));
    const beatenAt = first(copy.id, "beaten"), completedAt = first(copy.id, "completed");
    const earned = achievements.find((row) => row.libraryItemId === copy.id)?.earned ?? 0;
    const tracked = existing.some((row) => row.igdbId === copy.igdbId && row.platformId === copy.platformId);
    if (!minutes && beatenAt === null && completedAt === null && !earned && !tracked) return [];
    return [client.prepare(saveEventGame).bind(event.id, userId, copy.id, copy.igdbId, copy.platformId, copy.platformName, copy.name, copy.coverUrl, minutes, beatenAt, completedAt, earned, Date.now())];
  });
  statements.push(client.prepare("UPDATE event_members SET updated_at = ?3 WHERE event_id = ?1 AND user_id = ?2").bind(event.id, userId, Date.now()));
  for (let offset = 0; offset < statements.length; offset += 100) await client.batch(statements.slice(offset, offset + 100));
}
