import { getDb } from "../db";
import { accountDisplayName } from "./social";
import { messagesPath, profilePath } from "./profile-path";
import {
  conversationsQuery, markReadQuery, messageFriendQuery, messagePageSize, newerMessagesQuery, olderMessagesQuery, sendMessageQuery, unreadCountQuery,
  type ConversationRow, type MessageRow,
} from "./message-queries";
import type { Conversation, Message } from "./message-view";

// A poll returns at most this many newer messages; the next poll picks up any rest.
const newerLimit = 100;

const toMessage = (row: MessageRow): Message => ({ id: row.id, mine: Boolean(row.mine), body: row.body, createdAt: row.createdAt });

function toConversation(row: ConversationRow): Conversation {
  return {
    userId: row.userId, name: accountDisplayName(row), profileHref: profilePath(row), href: messagesPath(row),
    lastId: row.lastId, lastBody: row.lastBody, lastMine: Boolean(row.lastMine), lastAt: row.lastAt, unread: row.unread,
  };
}

export async function getConversations(viewerId: string) {
  const { results } = await getDb().$client.prepare(conversationsQuery).bind(viewerId).all<ConversationRow>();
  return results.map(toConversation);
}

export async function getUnreadMessageCount(viewerId: string) {
  const row = await getDb().$client.prepare(unreadCountQuery).bind(viewerId).first<{ count: number }>();
  return row?.count ?? 0;
}

// The friend check and the page read go to D1 together; null means the two are not verified accepted friends.
export async function getThread(viewerId: string, friendId: string, cursor: { before?: number; after?: number } = {}) {
  const client = getDb().$client;
  const [friend, page] = await client.batch([
    client.prepare(messageFriendQuery).bind(viewerId, friendId),
    cursor.after !== undefined
      ? client.prepare(newerMessagesQuery).bind(viewerId, friendId, cursor.after, newerLimit)
      : client.prepare(olderMessagesQuery).bind(viewerId, friendId, cursor.before ?? Number.MAX_SAFE_INTEGER, messagePageSize + 1),
  ]);
  if (!friend.results.length) return null;
  const rows = page.results as MessageRow[];
  if (cursor.after !== undefined) return { messages: rows.map(toMessage), more: false };
  return { messages: rows.slice(0, messagePageSize).reverse().map(toMessage), more: rows.length > messagePageSize };
}

export async function sendMessage(viewerId: string, friendId: string, body: string) {
  const row = await getDb().$client.prepare(sendMessageQuery).bind(viewerId, friendId, body, Date.now()).first<MessageRow>();
  return row ? toMessage(row) : null;
}

// Returns the viewer's remaining unread count so the header badge can update without another request.
export async function markMessagesRead(viewerId: string, friendId: string, upTo: number) {
  const client = getDb().$client;
  const [, count] = await client.batch([
    client.prepare(markReadQuery).bind(viewerId, friendId, Date.now(), upTo),
    client.prepare(unreadCountQuery).bind(viewerId),
  ]);
  return (count.results[0] as { count: number } | undefined)?.count ?? 0;
}
