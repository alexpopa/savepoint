"use client";

import { useState } from "react";
import { Check, LoaderCircle, UserPlus } from "lucide-react";

export type Relationship = { status: "pending" | "accepted"; direction: "incoming" | "outgoing" } | null;

export default function FriendButton({ userId, initialRelationship, refreshOnAccept = false }: { userId: string; initialRelationship: Relationship; refreshOnAccept?: boolean }) {
  const [relationship, setRelationship] = useState(initialRelationship);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act() {
    if (busy || relationship?.status === "accepted" || relationship?.direction === "outgoing") return;
    setBusy(true); setError("");
    try {
      const response = relationship?.direction === "incoming"
        ? await fetch(`/api/friends/${encodeURIComponent(userId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "accept" }) })
        : await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update friendship.");
      setRelationship(relationship?.direction === "incoming" ? { status: "accepted", direction: "incoming" } : { status: "pending", direction: "outgoing" });
      if (relationship?.direction === "incoming" && refreshOnAccept) window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update friendship."); }
    finally { setBusy(false); }
  }

  const label = relationship?.status === "accepted" ? "Friends" : relationship?.direction === "outgoing" ? "Request sent" : relationship?.direction === "incoming" ? "Accept request" : "Add friend";
  return <span className="friend-action"><button type="button" className="friend-button" onClick={() => void act()} disabled={busy || relationship?.status === "accepted" || relationship?.direction === "outgoing"}>
    {busy ? <LoaderCircle className="spin" size={16}/> : relationship ? <Check size={16}/> : <UserPlus size={16}/>} {label}
  </button>{error && <small className="action-error" role="alert">{error}</small>}</span>;
}
