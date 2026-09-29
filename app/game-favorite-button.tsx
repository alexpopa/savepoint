"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { favoriteLimit } from "../lib/game-favorite-queries";
import type { GameFavorite } from "../lib/game-favorites";

export async function favoriteRequest(url: string, init?: RequestInit): Promise<GameFavorite[]> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = await response.json() as { favorites: GameFavorite[]; error?: string };
  if (!response.ok) throw new Error(data.error || "Could not update favorite games.");
  return data.favorites;
}

export default function GameFavoriteButton({ igdbId, name, onChange }: { igdbId: number; name: string; onChange?: (favorites: GameFavorite[]) => void }) {
  const [favorites, setFavorites] = useState<GameFavorite[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void favoriteRequest("/api/game-favorites").then((rows) => { if (active) setFavorites(rows); })
      .catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);
  const favorite = favorites?.find((row) => row.igdbId === igdbId);
  const full = !favorite && favorites !== null && favorites.length >= favoriteLimit;
  async function toggle() {
    setBusy(true); setError("");
    try {
      if (!favorites) { setFavorites(await favoriteRequest("/api/game-favorites")); return; }
      const rows = await favoriteRequest(favorite ? `/api/game-favorites/${favorite.id}` : "/api/game-favorites", {
        method: favorite ? "DELETE" : "POST", body: favorite ? undefined : JSON.stringify({ igdbId }),
      });
      setFavorites(rows); onChange?.(rows);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update favorites."); }
    finally { setBusy(false); }
  }
  return <div className="game-favorite-action">
    <button type="button" className="platform-action" aria-pressed={Boolean(favorite)} aria-label={favorite ? `Remove ${name} from favorite games` : `Favorite ${name}`} disabled={busy || full || (!favorites && !error)} onClick={() => void toggle()}><Star size={17} fill={favorite ? "currentColor" : "none"} aria-hidden="true"/>{!favorites ? error ? "Retry favorites" : "Loading favorites…" : favorite ? "Favorited" : "Favorite game"}</button>
    <p className="game-dialog-help">{full ? `${favoriteLimit} of ${favoriteLimit} favorites. Remove one on your profile to make room.` : `Choose up to ${favoriteLimit} games and arrange them on your profile.`} <a href="/profile">My profile</a></p>
    {error && <p className="game-dialog-error" role="alert">{error}</p>}
  </div>;
}
