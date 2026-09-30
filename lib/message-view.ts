export type Message = { id: number; mine: boolean; body: string; createdAt: number };
export type Conversation = {
  userId: string; name: string; profileHref: string; href: string;
  lastId: number | null; lastBody: string | null; lastMine: boolean; lastAt: number | null; unread: number;
};
export type ThreadRow =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: Message; groupStart: boolean; groupEnd: boolean; time: string };

// Consecutive messages from one sender within this gap share a bubble group and one timestamp.
const groupGapMs = 5 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

// Trimmed text of 1–2000 characters, counted as SQLite length() counts them (code points), or null.
export function parseMessageBody(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const body = value.replace(/\r\n?/g, "\n").trim();
  const length = [...body].length;
  return length >= 1 && length <= limit ? body : null;
}

export function parseMessageId(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

// Same order as conversationsQuery, so the client can re-sort after sending without a reload.
export function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((a, b) =>
    (a.lastId === null ? 1 : 0) - (b.lastId === null ? 1 : 0)
    || (b.lastAt ?? 0) - (a.lastAt ?? 0)
    || (b.lastId ?? 0) - (a.lastId ?? 0)
    || a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    || a.userId.localeCompare(b.userId));
}

// Friends whose display name contains the query, ignoring case and surrounding spaces; list order is kept.
export function filterConversations(conversations: Conversation[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return needle ? conversations.filter((conversation) => conversation.name.toLocaleLowerCase().includes(needle)) : conversations;
}

function dayKey(at: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function clockTime(at: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
}

function dayLabel(at: number, now: number, timeZone: string) {
  const key = dayKey(at, timeZone);
  if (key === dayKey(now, timeZone)) return "Today";
  if (key === dayKey(now - dayMs, timeZone)) return "Yesterday";
  const sameYear = key.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(at);
}

// Short time for the conversation list: clock time today, weekday within a week, otherwise the date.
export function listTime(at: number, now: number, timeZone: string) {
  if (dayKey(at, timeZone) === dayKey(now, timeZone)) return clockTime(at, timeZone);
  if (now - at < 6 * dayMs) return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(at);
  const sameYear = dayKey(at, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(at);
}

// Oldest-first messages with a separator at each new day and bubble groups per sender.
export function threadRows(messages: Message[], now: number, timeZone: string): ThreadRow[] {
  const rows: ThreadRow[] = [];
  messages.forEach((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const day = dayKey(message.createdAt, timeZone);
    const newDay = !previous || dayKey(previous.createdAt, timeZone) !== day;
    if (newDay) rows.push({ kind: "day", key: `day:${day}`, label: dayLabel(message.createdAt, now, timeZone) });
    const joins = (a: Message, b: Message) => a.mine === b.mine && b.createdAt - a.createdAt <= groupGapMs && dayKey(a.createdAt, timeZone) === dayKey(b.createdAt, timeZone);
    rows.push({
      kind: "message", key: `message:${message.id}`, message,
      groupStart: newDay || !joins(previous, message),
      groupEnd: !next || !joins(message, next),
      time: clockTime(message.createdAt, timeZone),
    });
  });
  return rows;
}

// Appends messages the client has not shown yet, keeping id order; polls and sends can overlap.
export function mergeMessages(current: Message[], incoming: Message[]) {
  const known = new Set(current.map((message) => message.id));
  const fresh = incoming.filter((message) => !known.has(message.id));
  return fresh.length ? [...current, ...fresh].sort((a, b) => a.id - b.id) : current;
}
