import { notFound } from "next/navigation";
import { requireUser } from "../auth";
import Messages from "./messages";
import { getConversations, getThread } from "../../lib/messages";
import type { Conversation } from "../../lib/message-view";
import { hasPermission } from "../../lib/permissions";
import { ensureAccount } from "../../lib/social";

// Shared by /messages and /messages/:name; the segment matches a friend's display name or, for legacy accounts, their ID.
export default async function MessagesPage({ segment }: { segment: string | null }) {
  const user = await requireUser(segment === null ? "/messages" : `/messages/${encodeURIComponent(segment)}`);
  await ensureAccount(user);
  let conversations: Conversation[] = [];
  let error = false;
  try { conversations = await getConversations(user.userId); } catch { error = true; }
  const selected = segment === null || error ? undefined
    : conversations.find((conversation) => conversation.userId === segment || conversation.href.toLowerCase() === `/messages/${encodeURIComponent(segment)}`.toLowerCase());
  if (segment !== null && !error && !selected) notFound();
  let thread: Awaited<ReturnType<typeof getThread>> = null;
  let threadError = false;
  if (selected) {
    try { thread = await getThread(user.userId, selected.userId); } catch { threadError = true; }
  }
  return <Messages
    email={user.email} showAdmin={hasPermission(user, false)} initialConversations={conversations} error={error}
    initialSelectedId={selected?.userId ?? null} initialThread={thread} initialThreadError={threadError}
  />;
}
