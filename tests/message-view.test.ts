import assert from "node:assert/strict";
import test from "node:test";
import { filterConversations, listTime, mergeMessages, parseMessageBody, parseMessageId, sortConversations, threadRows, type Conversation, type Message } from "../lib/message-view.ts";

test("message bodies are trimmed and limited by characters, not UTF-16 units", () => {
  assert.equal(parseMessageBody("  hello\r\nthere  ", 11), "hello\nthere");
  assert.equal(parseMessageBody("   ", 10), null);
  assert.equal(parseMessageBody(12, 10), null);
  assert.equal(parseMessageBody("🎮".repeat(10), 10), "🎮".repeat(10));
  assert.equal(parseMessageBody("🎮".repeat(11), 10), null);
});

test("message ids are positive safe integers", () => {
  assert.equal(parseMessageId("42"), 42);
  assert.equal(parseMessageId(42), 42);
  for (const value of ["0", "-1", "1.5", "01", "abc", "99999999999999999", 0, 1.5, null]) assert.equal(parseMessageId(value), null);
});

const conversation = (userId: string, name: string, lastId: number | null, lastAt = lastId): Conversation => ({
  userId, name, profileHref: "", href: "", lastId, lastBody: null, lastMine: false, lastAt, unread: 0,
});

test("conversations sort by latest message time, then friends without messages by name", () => {
  const sorted = sortConversations([conversation("1", "zed", null), conversation("2", "Amy", 3), conversation("3", "bob", null), conversation("4", "Cat", 9), conversation("5", "Dan", 10, 1)]);
  assert.deepEqual(sorted.map((item) => item.name), ["Cat", "Amy", "Dan", "bob", "zed"]);
});

test("the friend filter matches display names case-insensitively and keeps list order", () => {
  const list = [conversation("1", "PixelNomad", 5), conversation("2", "RetroRanger", 4), conversation("3", "pixie", null)];
  assert.deepEqual(filterConversations(list, "  PIX ").map((item) => item.name), ["PixelNomad", "pixie"]);
  assert.equal(filterConversations(list, "   "), list);
  assert.deepEqual(filterConversations(list, "zzz"), []);
});

const at = (iso: string) => Date.parse(iso);
const message = (id: number, mine: boolean, iso: string): Message => ({ id, mine, body: `m${id}`, createdAt: at(iso) });

test("threads split by day and group one sender's messages within five minutes", () => {
  const now = at("2026-09-30T18:00:00Z");
  const rows = threadRows([
    message(1, false, "2026-09-28T10:00:00Z"),
    message(2, true, "2026-09-29T23:58:00Z"),
    message(3, true, "2026-09-30T00:01:00Z"),
    message(4, true, "2026-09-30T00:04:00Z"),
    message(5, true, "2026-09-30T00:10:00Z"),
    message(6, false, "2026-09-30T00:11:00Z"),
  ], now, "UTC");
  assert.deepEqual(rows.map((row) => row.kind === "day" ? row.label : `${row.message.id}${row.groupStart ? "<" : ""}${row.groupEnd ? ">" : ""}`),
    ["Mon, Sep 28", "1<>", "Yesterday", "2<>", "Today", "3<", "4>", "5<>", "6<>"]);
  const [day] = threadRows([message(1, false, "2026-09-30T00:30:00Z")], now, "America/Los_Angeles");
  assert.deepEqual(day, { kind: "day", key: "day:2026-09-29", label: "Yesterday" });
});

test("list times show the clock today, the weekday this week, then the date", () => {
  const now = at("2026-09-30T18:00:00Z");
  assert.equal(listTime(at("2026-09-30T09:05:00Z"), now, "UTC"), "9:05 AM");
  assert.equal(listTime(at("2026-09-27T09:05:00Z"), now, "UTC"), "Sun");
  assert.equal(listTime(at("2026-08-02T09:05:00Z"), now, "UTC"), "Aug 2");
  assert.equal(listTime(at("2025-08-02T09:05:00Z"), now, "UTC"), "Aug 2, 2025");
});

test("merging keeps id order and skips messages already shown", () => {
  const current = [message(1, true, "2026-09-30T00:00:00Z"), message(3, true, "2026-09-30T00:00:00Z")];
  assert.deepEqual(mergeMessages(current, [message(3, true, "2026-09-30T00:00:00Z"), message(2, false, "2026-09-30T00:00:00Z")]).map((item) => item.id), [1, 2, 3]);
  assert.equal(mergeMessages(current, [message(1, true, "2026-09-30T00:00:00Z")]), current);
});
