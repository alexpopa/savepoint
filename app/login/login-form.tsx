"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandWordmark } from "../site-header";

export default function LoginForm({ returnTo }: { returnTo: string }) {
  const [mode, setMode] = useState<"login" | "register" | "reset" | "resend">("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const endpoint = mode === "reset" ? "request-reset" : mode === "resend" ? "resend-verification" : mode;
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          password: fields.get("password"),
          displayName: fields.get("displayName"),
          returnTo,
        }),
      });
      const result = await response.json() as { error?: string; returnTo?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Please try again.");
      if (result.message) { setMessage(result.message); setBusy(false); }
      else window.location.assign(result.returnTo || "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <div className="auth-shell">
      <Link className="auth-brand" href="/" aria-label="RGBoner home"><BrandWordmark /></Link>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">PLAYER ACCOUNT</p>
        <h1 id="auth-title">{mode === "login" ? "Welcome back" : mode === "register" ? "Create an account" : mode === "reset" ? "Reset your password" : "Verify your email"}</h1>
        <p className="subcopy">{mode === "login" ? "Sign in with your RGBoner email and password." : mode === "register" ? "Save your games and connect with players using a verified email account." : "Enter your email and we’ll send you a link."}</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        {message && <p className="notice" role="status">{message}</p>}
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {mode === "register" && <label>Display name<input name="displayName" type="text" autoComplete="nickname" maxLength={80} required /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
          {(mode === "login" || mode === "register") && <label>Password<input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : undefined} maxLength={128} required /></label>}
          {mode === "register" && <p className="auth-hint">Use at least 12 characters. You’ll need to verify your email before signing in.</p>}
          <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "reset" ? "Send reset link" : "Send verification link"}</button>
        </form>
        <p className="auth-switch">{mode === "login" ? "New to RGBoner?" : "Already have an account?"} <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
        {mode === "login" && <p className="auth-switch auth-secondary"><button type="button" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot password?</button><button type="button" onClick={() => { setMode("resend"); setError(""); setMessage(""); }}>Resend verification link</button></p>}
      </section>
    </div>
  </main>;
}
