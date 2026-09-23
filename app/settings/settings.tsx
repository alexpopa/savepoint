"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import SiteHeader from "../site-header";

type Account = { userId: string; email: string; displayName: string; isPublic: boolean };
type Person = { userId: string; displayName: string; email: string; isPublic: boolean; status: "pending" | "accepted"; direction: "incoming" | "outgoing" };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result as T;
}

export default function Settings({ email: signedInEmail }: { email: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const data = await api<{ account: Account; people: Person[] }>("/api/account");
    setAccount(data.account);
    setPeople(data.people);
  }

  useEffect(() => { void api<{ account: Account; people: Person[] }>("/api/account").then((data) => { setAccount(data.account); setPeople(data.people); }).catch((e) => setError(e.message)); }, []);

  async function changeVisibility(isPublic: boolean) {
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/account", { method: "PATCH", body: JSON.stringify({ isPublic }) });
      setAccount((current) => current ? { ...current, isPublic } : current);
      setNotice(`Your library is now ${isPublic ? "public" : "private"}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save visibility."); }
    finally { setBusy(false); }
  }

  async function sendRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/friends", { method: "POST", body: JSON.stringify({ email }) });
      setEmail(""); await refresh(); setNotice("Friend request sent.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send request."); }
    finally { setBusy(false); }
  }

  async function act(person: Person, action: "accept" | "remove") {
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/friends/${encodeURIComponent(person.userId)}`, action === "accept"
        ? { method: "PATCH", body: JSON.stringify({ action: "accept" }) }
        : { method: "DELETE" });
      await refresh();
      setNotice(action === "accept" ? `You and ${person.displayName} are now friends.` : "Friendship or request removed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update friends."); }
    finally { setBusy(false); }
  }

  const incoming = people.filter((person) => person.status === "pending" && person.direction === "incoming");
  const outgoing = people.filter((person) => person.status === "pending" && person.direction === "outgoing");
  const friends = people.filter((person) => person.status === "accepted");

  return <main className="library-page">
    <SiteHeader email={signedInEmail}/>
    <div className="library-wrap settings-wrap"><p className="eyebrow">ACCOUNT</p><h1>Settings & friends</h1><p className="subcopy">Control who can see your game library and connect with other players.</p>
      {error && <div className="notice error settings-notice" role="alert">{error}</div>}
      {notice && <div className="notice success settings-notice" role="status">{notice}</div>}
      {!account ? <p className="muted"><LoaderCircle className="spin" size={18}/> Loading account…</p> : <>
        <section className="settings-card"><h2>Library visibility</h2><p>Your library starts private. Friends can always see it. Public libraries can be viewed by anyone signed in to RGBoner.</p><div className="visibility-options"><button type="button" className={!account.isPublic ? "selected" : ""} disabled={busy} onClick={() => void changeVisibility(false)} aria-pressed={!account.isPublic}>Private</button><button type="button" className={account.isPublic ? "selected" : ""} disabled={busy} onClick={() => void changeVisibility(true)} aria-pressed={account.isPublic}>Public</button></div><p className="muted">Your profile link: <code>/users/{encodeURIComponent(account.userId)}</code></p></section>
        <section className="settings-card"><h2>Send a friend request</h2><p>Enter the email address they use for RGBoner. They need to have opened RGBoner at least once.</p><form className="friend-form" onSubmit={(event) => void sendRequest(event)}><input type="email" aria-label="Friend's email address" placeholder="player@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required/><button disabled={busy || !email.trim()}>Send request</button></form></section>
        <section className="settings-card"><h2>Incoming requests <span className="small-count">{incoming.length}</span></h2>{incoming.length ? incoming.map((person) => <PersonRow key={person.userId} person={person} actions={<><button disabled={busy} onClick={() => void act(person, "accept")}>Accept</button><button className="secondary" disabled={busy} onClick={() => void act(person, "remove")}>Decline</button></>}/>) : <p className="muted">No incoming requests.</p>}</section>
        <section className="settings-card"><h2>Friends <span className="small-count">{friends.length}</span></h2>{friends.length ? friends.map((person) => <PersonRow key={person.userId} person={person} actions={<button className="secondary" disabled={busy} onClick={() => void act(person, "remove")}>Remove</button>}/>) : <p className="muted">No friends yet.</p>}</section>
        <section className="settings-card"><h2>Sent requests <span className="small-count">{outgoing.length}</span></h2>{outgoing.length ? outgoing.map((person) => <PersonRow key={person.userId} person={person} actions={<button className="secondary" disabled={busy} onClick={() => void act(person, "remove")}>Cancel</button>}/>) : <p className="muted">No pending requests.</p>}</section>
      </>}
    </div>
  </main>;
}

function PersonRow({ person, actions }: { person: Person; actions: React.ReactNode }) {
  return <div className="person-row"><div><Link className="inline-link" href={`/users/${encodeURIComponent(person.userId)}`}>{person.displayName}</Link><p>{person.email}</p></div><div className="person-actions">{actions}</div></div>;
}
