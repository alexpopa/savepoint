"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowUpRight, MessageSquare, Search, SendHorizontal } from "lucide-react";
import SiteHeader, { messagesChangedEvent } from "../site-header";
import { PixelAvatar } from "../profile-avatar";
import { filterConversations, listTime, mergeMessages, sortConversations, threadRows, type Conversation, type Message } from "../../lib/message-view";

type Thread = { friendId: string; messages: Message[]; more: boolean; syncedId: number };
type ThreadPage = { messages: Message[]; more: boolean };

const messageLimit = 2000;
const previewLength = 140;
const pollMs = 10_000;
// Within this distance of the bottom, new messages keep the thread scrolled to the latest.
const stickyPx = 96;

// The zone never changes during a visit; server markup uses UTC and hydration switches to the viewer's zone.
const noSubscription = () => () => {};
const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const serverTimeZone = () => "UTC";
const newestId = (messages: Message[]) => messages.at(-1)?.id ?? 0;
const toThread = (friendId: string, page: ThreadPage): Thread => ({ friendId, messages: page.messages, more: page.more, syncedId: newestId(page.messages) });

export default function Messages({ email, showAdmin, initialConversations, error, initialSelectedId, initialThread, initialThreadError }: {
  email: string; showAdmin: boolean; initialConversations: Conversation[]; error: boolean;
  initialSelectedId: string | null; initialThread: ThreadPage | null; initialThreadError: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [thread, setThread] = useState<Thread | null>(initialSelectedId && initialThread ? toThread(initialSelectedId, initialThread) : null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(initialThreadError ? "Messages couldn’t load. Please try again." : "");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [friendQuery, setFriendQuery] = useState("");
  const timeZone = useSyncExternalStore(noSubscription, localTimeZone, serverTimeZone);
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef<HTMLDivElement>(null);
  const olderRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const pendingScroll = useRef<"bottom" | { height: number; top: number } | null>("bottom");
  const selectedRef = useRef(selectedId);
  const threadRef = useRef(thread);
  const conversationsRef = useRef(conversations);
  const polling = useRef(false);
  selectedRef.current = selectedId;
  threadRef.current = thread;
  conversationsRef.current = conversations;

  const selected = conversations.find((conversation) => conversation.userId === selectedId) ?? null;
  const shownConversations = filterConversations(conversations, friendQuery);
  const unreadTotal = conversations.reduce((total, conversation) => total + conversation.unread, 0);
  const draftLength = [...draft].length;
  const draftReady = draft.trim().length > 0 && draftLength <= messageLimit;

  // Keep the reading position: stick to the bottom on open and for new messages, and hold still while older ones load above.
  useLayoutEffect(() => {
    const log = logRef.current;
    const pending = pendingScroll.current;
    if (!log || !pending) return;
    pendingScroll.current = null;
    log.scrollTop = pending === "bottom" ? log.scrollHeight : log.scrollHeight - pending.height + pending.top;
  }, [thread, threadLoading, timeZone]);

  // Grow the composer with its text, up to the height set in CSS.
  useLayoutEffect(() => {
    const field = draftRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + 2}px`;
  }, [draft, selectedId]);

  // Scrolling up to the top of the thread loads the previous page; the button covers keyboard and failures.
  useEffect(() => {
    const button = olderRef.current;
    if (!button || !thread?.more || loadingOlder || olderError) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadOlder();
    }, { root: logRef.current, rootMargin: "160px 0px 0px 0px" });
    observer.observe(button);
    return () => observer.disconnect();
  });

  useEffect(() => {
    const tick = () => { if (!document.hidden) void poll(); };
    const timer = window.setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  });

  useEffect(() => {
    function followHistory() {
      const path = window.location.pathname.toLowerCase();
      const target = conversationsRef.current.find((conversation) => conversation.href.toLowerCase() === path);
      if (target) void openConversation(target, false);
      else closeConversation(false);
    }
    window.addEventListener("popstate", followHistory);
    return () => window.removeEventListener("popstate", followHistory);
  });

  // Opening the page on a conversation marks what it shows as read.
  useEffect(() => {
    if (initialSelectedId && initialThread) void markRead(initialSelectedId, initialThread.messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nearBottom() {
    const log = logRef.current;
    return !log || log.scrollHeight - log.scrollTop - log.clientHeight < stickyPx;
  }

  function updateConversation(userId: string, change: Partial<Conversation>) {
    setConversations((current) => sortConversations(current.map((conversation) => conversation.userId === userId ? { ...conversation, ...change } : conversation)));
  }

  function publishUnread(count: number) {
    window.dispatchEvent(new CustomEvent(messagesChangedEvent, { detail: count }));
  }

  async function markRead(friendId: string, messages: Message[]) {
    const upTo = newestId(messages);
    const conversation = conversationsRef.current.find((item) => item.userId === friendId);
    if (!upTo || !conversation?.unread) return;
    try {
      const { count } = await request<{ count: number }>(`/api/messages/${encodeURIComponent(friendId)}/read`, { method: "PUT", body: JSON.stringify({ upTo }) });
      updateConversation(friendId, { unread: 0 });
      publishUnread(count);
    } catch {}
  }

  async function openConversation(conversation: Conversation, push = true) {
    if (push) window.history.pushState(null, "", conversation.href);
    const friendId = conversation.userId;
    setSelectedId(friendId);
    setThread(null); setThreadError(""); setOlderError(""); setSendError(""); setDraft("");
    setThreadLoading(true);
    requestAnimationFrame(() => headingRef.current?.focus());
    try {
      const page = await request<ThreadPage>(`/api/messages/${encodeURIComponent(friendId)}`);
      if (selectedRef.current !== friendId) return;
      pendingScroll.current = "bottom";
      setThread(toThread(friendId, page));
      void markRead(friendId, page.messages);
    } catch (error) {
      if (selectedRef.current === friendId) setThreadError(error instanceof Error ? error.message : "Messages couldn’t load. Please try again.");
    } finally {
      if (selectedRef.current === friendId) setThreadLoading(false);
    }
  }

  function closeConversation(push = true) {
    const previous = selectedRef.current;
    if (push) window.history.pushState(null, "", "/messages");
    setSelectedId(null); setThread(null); setThreadError(""); setDraft("");
    if (previous) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-conversation="${CSS.escape(previous)}"]`)?.focus());
  }

  async function loadOlder() {
    const current = threadRef.current;
    if (!current?.more || loadingOlder || !current.messages.length) return;
    setLoadingOlder(true); setOlderError("");
    try {
      const page = await request<ThreadPage>(`/api/messages/${encodeURIComponent(current.friendId)}?before=${current.messages[0].id}`);
      if (threadRef.current?.friendId !== current.friendId) return;
      const log = logRef.current;
      pendingScroll.current = log ? { height: log.scrollHeight, top: log.scrollTop } : null;
      setThread((latest) => latest && latest.friendId === current.friendId
        ? { ...latest, messages: [...page.messages, ...latest.messages], more: page.more }
        : latest);
    } catch (error) { setOlderError(error instanceof Error ? error.message : "Older messages couldn’t load."); }
    finally { setLoadingOlder(false); }
  }

  // One list request per tick; the open thread is fetched only when the list shows something newer in it.
  async function poll() {
    if (polling.current) return;
    polling.current = true;
    try {
      const { conversations: fresh } = await request<{ conversations: Conversation[] }>("/api/messages");
      setConversations(fresh);
      conversationsRef.current = fresh;
      setNow(Date.now());
      const current = threadRef.current;
      const entry = current && fresh.find((conversation) => conversation.userId === current.friendId);
      if (current && entry?.lastId && entry.lastId > current.syncedId) {
        const page = await request<ThreadPage>(`/api/messages/${encodeURIComponent(current.friendId)}?after=${current.syncedId}`);
        if (threadRef.current?.friendId !== current.friendId) return;
        if (nearBottom()) pendingScroll.current = "bottom";
        setThread((latest) => latest && latest.friendId === current.friendId
          ? { ...latest, messages: mergeMessages(latest.messages, page.messages), syncedId: Math.max(latest.syncedId, newestId(page.messages)) }
          : latest);
        const incoming = page.messages.filter((message) => !message.mine);
        if (incoming.length) {
          setAnnouncement(`${incoming.length === 1 ? "New message" : `${incoming.length} new messages`} from ${entry.name}`);
          await markRead(current.friendId, page.messages);
          return;
        }
      }
      publishUnread(fresh.reduce((total, conversation) => total + conversation.unread, 0));
    } catch {
      // A missed poll is retried on the next tick.
    } finally {
      polling.current = false;
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const friendId = selectedId;
    if (!friendId || !draftReady || sending) return;
    setSending(true); setSendError("");
    try {
      const { message } = await request<{ message: Message }>(`/api/messages/${encodeURIComponent(friendId)}`, { method: "POST", body: JSON.stringify({ body: draft }) });
      if (threadRef.current?.friendId === friendId) {
        pendingScroll.current = "bottom";
        setThread((latest) => latest && latest.friendId === friendId ? { ...latest, messages: mergeMessages(latest.messages, [message]) } : latest);
      }
      updateConversation(friendId, { lastId: message.id, lastBody: [...message.body].slice(0, previewLength).join(""), lastMine: true, lastAt: message.createdAt });
      setDraft("");
    } catch (error) { setSendError(error instanceof Error ? error.message : "Your message wasn’t sent. Please try again."); }
    finally {
      setSending(false);
      draftRef.current?.focus();
    }
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const rows = thread ? threadRows(thread.messages, now, timeZone) : [];

  return <main className="library-page"><SiteHeader email={email} showAdmin={showAdmin}/>
    <div className="messages-wrap">
      <header className="timeline-heading messages-heading"><div><p className="timeline-eyebrow"><span className="timeline-rgb" aria-hidden="true"/>Direct line</p><h1>Messages</h1></div></header>
      <section className={`messages-screen${selectedId ? " has-thread" : ""}`} aria-label="Messages with friends">
        <div className="timeline-screen-label"><span>Friends / messages</span><span>{String(unreadTotal).padStart(2, "0")} unread</span></div>
        {error ? <div className="timeline-empty" role="alert"><h2>Messages couldn’t load.</h2><p>Please try again in a moment.</p><a href="/messages">Try again</a></div>
          : conversations.length === 0 ? <div className="timeline-empty"><MessageSquare size={32} aria-hidden="true"/><h2>No one to message yet.</h2><p>Once a player accepts your friend request, you can message them here.</p><a href="/users">Find your friends <ArrowUpRight size={16} aria-hidden="true"/></a></div>
          : <div className="messages-panes">
            <nav className="messages-list" aria-label="Conversations">
              <label className="messages-search"><span className="messages-hidden">Search friends</span><span className="library-search-field"><Search size={17} aria-hidden="true"/><input
                type="search" value={friendQuery} placeholder="Search friends" maxLength={100} autoComplete="off" spellCheck={false}
                onChange={(event) => setFriendQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape" && friendQuery) { event.preventDefault(); setFriendQuery(""); } }}
              /></span></label>
              {shownConversations.length === 0 && <p className="messages-no-match">No friends match “{friendQuery.trim()}”.</p>}
              <ul>{shownConversations.map((conversation) => <li key={conversation.userId}>
                <a
                  className={`messages-contact${conversation.unread ? " is-unread" : ""}`}
                  href={conversation.href}
                  data-conversation={conversation.userId}
                  aria-current={conversation.userId === selectedId ? "page" : undefined}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    event.preventDefault();
                    if (conversation.userId !== selectedId) void openConversation(conversation);
                    else requestAnimationFrame(() => headingRef.current?.focus());
                  }}
                >
                  <span className="messages-avatar"><PixelAvatar seed={conversation.userId}/></span>
                  <span className="messages-contact-copy">
                    <span className="messages-contact-top"><strong>{conversation.name}</strong>{conversation.lastAt !== null && <time dateTime={new Date(conversation.lastAt).toISOString()}>{listTime(conversation.lastAt, now, timeZone)}</time>}</span>
                    <span className="messages-contact-preview">{conversation.lastBody === null ? "No messages yet" : `${conversation.lastMine ? "You: " : ""}${conversation.lastBody}`}</span>
                  </span>
                  {conversation.unread > 0 && <><span className="friend-request-badge" aria-hidden="true">{conversation.unread}</span><span className="messages-hidden">, {conversation.unread} unread</span></>}
                </a>
              </li>)}</ul>
            </nav>
            <div className="messages-thread">
              {selected ? <>
                <header className="messages-thread-head">
                  <button type="button" className="messages-back icon-button" aria-label="Back to conversations" title="Back to conversations" onClick={() => closeConversation()}><ArrowLeft size={20} aria-hidden="true"/></button>
                  <span className="messages-avatar"><PixelAvatar seed={selected.userId}/></span>
                  <h2 ref={headingRef} tabIndex={-1}><a href={selected.profileHref}>{selected.name}</a></h2>
                </header>
                <div className="messages-log" ref={logRef}>
                  {thread?.more && <button ref={olderRef} type="button" className="messages-older" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading older messages…" : "Load older messages"}</button>}
                  {olderError && <p className="notice error" role="alert">{olderError}</p>}
                  {threadLoading ? <p className="messages-note">Loading messages…</p>
                    : threadError ? <p className="notice error" role="alert">{threadError}</p>
                    : !thread?.messages.length ? <div className="messages-hello"><MessageSquare size={28} aria-hidden="true"/><p>Say hi to {selected.name}.</p></div>
                    : <ol className="messages-rows" aria-label={`Messages with ${selected.name}`}>{rows.map((row) => row.kind === "day"
                      ? <li key={row.key} className="messages-day"><span>{row.label}</span></li>
                      : <li key={row.key} className={`message ${row.message.mine ? "is-mine" : "is-theirs"}${row.groupStart ? " is-group-start" : ""}`}>
                        <p className="message-bubble"><span className="messages-hidden">{row.message.mine ? "You" : selected.name} at {row.time}: </span>{row.message.body}</p>
                        {row.groupEnd && <time dateTime={new Date(row.message.createdAt).toISOString()} aria-hidden="true">{row.time}</time>}
                      </li>)}</ol>}
                </div>
                <form className="messages-composer" onSubmit={send}>
                  <label className="messages-hidden" htmlFor="message-draft">Message {selected.name}</label>
                  <textarea
                    id="message-draft" ref={draftRef} rows={1} value={draft} placeholder={`Message ${selected.name}`}
                    aria-describedby={draftLength > messageLimit - 200 ? "message-count" : undefined}
                    enterKeyHint="send" onChange={(event) => setDraft(event.target.value)} onKeyDown={sendOnEnter} disabled={Boolean(threadError) || threadLoading}
                  />
                  <button type="submit" className="messages-send" aria-label="Send message" title="Send (Enter)" disabled={!draftReady || sending}><SendHorizontal size={19} aria-hidden="true"/></button>
                  {draftLength > messageLimit - 200 && <p id="message-count" className={`messages-count${draftLength > messageLimit ? " is-over" : ""}`}>{draftLength}/{messageLimit}</p>}
                  {sendError && <p className="notice error messages-send-error" role="alert">{sendError}</p>}
                </form>
              </> : <div className="messages-idle"><MessageSquare size={32} aria-hidden="true"/><h2>Pick a friend</h2><p>Choose a conversation to read and reply.</p></div>}
            </div>
          </div>}
      </section>
      <p className="messages-hidden" aria-live="polite">{announcement}</p>
    </div>
  </main>;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}
