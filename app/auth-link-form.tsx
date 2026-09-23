"use client";

import { useState } from "react";
import { BrandWordmark } from "./site-header";

export default function AuthLinkForm({ mode, token }: { mode: "verify" | "reset"; token: string }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const validToken = /^[0-9a-f]{64}$/.test(token);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/auth/${mode === "verify" ? "verify" : "reset-password"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: fields.get("password") }),
      });
      const result = await response.json() as { error?: string; message?: string; returnTo?: string };
      if (!response.ok) throw new Error(result.error || "Please try again.");
      window.history.replaceState(null, "", window.location.pathname);
      if (mode === "verify") window.location.assign(result.returnTo || "/");
      else { setMessage(result.message || "Password changed."); setBusy(false); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
      setBusy(false);
    }
  }

  return <main className="auth-page"><div className="auth-shell">
    <a className="auth-brand" href="/" aria-label="RGBoner home"><BrandWordmark /></a>
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">PLAYER ACCOUNT</p>
      <h1 id="auth-title">{mode === "verify" ? "Verify your email" : "Choose a new password"}</h1>
      <p className="subcopy">{mode === "verify" ? "Confirm your email to start saving games and connecting with players." : "Use at least 12 characters for your new password."}</p>
      {!validToken && <p className="notice error" role="alert">This link is invalid. Request a new one from the sign-in page.</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      {validToken && !message && <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {mode === "reset" && <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
        <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "verify" ? "Verify email" : "Change password"}</button>
      </form>}
      <p className="auth-switch"><a href="/login">Back to sign in</a></p>
    </section>
  </div></main>;
}
