"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

const scores = [1, 2, 3, 4, 5];

async function ratingRequest(igdbId: number, init?: RequestInit): Promise<number | null> {
  const response = await fetch(`/api/game-ratings/${igdbId}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = await response.json() as { score: number | null; error?: string };
  if (!response.ok) throw new Error(data.error || "Could not update your score.");
  return data.score;
}

// Read-only stars for cards and the timeline; the label carries the score for assistive technology.
export function ScoreStars({ score, className = "" }: { score: number; className?: string }) {
  return <span className={`score-stars ${className}`} role="img" aria-label={`Rated ${score} out of 5 stars`}>
    {scores.map((value) => <Star key={value} size={13} fill={value <= score ? "currentColor" : "none"} className={value <= score ? "is-filled" : ""} aria-hidden="true"/>)}
  </span>;
}

// Clicking a star sets the score; clicking the current score again clears it.
export default function GameRating({ igdbId, name, onChange }: { igdbId: number; name: string; onChange?: () => void }) {
  const [score, setScore] = useState<number | null | undefined>(undefined);
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void ratingRequest(igdbId).then((value) => { if (active) setScore(value); })
      .catch((error) => { if (active) { setScore(null); setError(error.message); } });
    return () => { active = false; };
  }, [igdbId]);
  async function rate(value: number) {
    setBusy(true); setError("");
    try {
      setScore(await ratingRequest(igdbId, value === score ? { method: "DELETE" } : { method: "PUT", body: JSON.stringify({ score: value }) }));
      onChange?.();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update your score."); }
    finally { setBusy(false); }
  }
  const shown = preview ?? score ?? 0;
  return <div className="game-rating">
    <div className="game-rating-row" role="group" aria-label={`Your score for ${name}`} onMouseLeave={() => setPreview(null)}>
      <span className="game-rating-label" aria-hidden="true">Your score</span>
      {scores.map((value) => <button type="button" key={value} className={`game-rating-star${value <= shown ? " is-filled" : ""}`} aria-pressed={value === score} aria-label={value === score ? `Clear your ${value} star score` : `Rate ${value} out of 5 stars`} title={value === score ? "Clear score" : `${value} of 5`} disabled={busy || score === undefined} onMouseEnter={() => setPreview(value)} onClick={() => void rate(value)}>
        <Star size={22} fill={value <= shown ? "currentColor" : "none"} aria-hidden="true"/>
      </button>)}
    </div>
    {error && <p className="game-dialog-error" role="alert">{error}</p>}
  </div>;
}
