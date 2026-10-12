"use client";

import { useEffect, useRef, useState } from "react";
import { Award, Gamepad2, LoaderCircle, Lock, Trophy, X } from "lucide-react";
import type { XboxAchievement, XboxShowcaseGame } from "../lib/xbox-types";

type Totals = { games: number; gamerscore: number; completed: number };

function Cover({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="xbox-cover">{src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)}/> : <span className="cover-fallback"><Gamepad2 size={24} aria-hidden="true"/><span>{name.slice(0, 1)}</span></span>}</span>;
}

// Added Xbox games, most recently played first. Hidden when the player has none.
export default function XboxAchievements({ playerId, games, totals }: { playerId: string; games: XboxShowcaseGame[]; totals: Totals }) {
  const [selected, setSelected] = useState<XboxShowcaseGame | null>(null);
  if (!games.length) return null;
  return <section className="profile-section" aria-labelledby="xbox-title">
    <div className="profile-section-head">
      <h2 id="xbox-title" className="profile-label"><Trophy size={15} aria-hidden="true"/>Xbox achievements</h2>
      <p className="xbox-totals">{totals.gamerscore.toLocaleString()}G · {totals.completed.toLocaleString()} completed</p>
    </div>
    <ul className="xbox-showcase">
      {games.map((game) => <li key={game.titleRowId}>
        <button type="button" className="xbox-game" aria-haspopup="dialog" onClick={() => setSelected(game)}>
          <Cover src={game.coverUrl} name={game.name}/>
          <span className="xbox-game-copy">
            <span className="xbox-game-name">{game.name}</span>
            <span className="xbox-game-meta">{game.completedAt ? <><Award size={14} aria-hidden="true"/> All achievements</> : `${game.currentAchievements} of ${game.totalAchievements} achievements`}</span>
            <progress className="xbox-progress" aria-label={`${game.name} achievement progress`} value={game.currentAchievements} max={game.totalAchievements}/>
            <span className="xbox-game-meta">{game.currentGamerscore.toLocaleString()} / {game.totalGamerscore.toLocaleString()}G</span>
          </span>
        </button>
      </li>)}
    </ul>
    {selected && <AchievementsDialog playerId={playerId} game={selected} onClose={() => setSelected(null)}/>}
  </section>;
}

function AchievementsDialog({ playerId, game, onClose }: { playerId: string; game: XboxShowcaseGame; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [achievements, setAchievements] = useState<XboxAchievement[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    void fetch(`/api/xbox/achievements?player=${encodeURIComponent(playerId)}&title=${game.titleRowId}`).then(async (response) => {
      const data = await response.json() as { achievements?: XboxAchievement[]; error?: string };
      if (!response.ok || !data.achievements) throw new Error(data.error || "Could not load achievements.");
      if (active) setAchievements(data.achievements);
    }).catch((error) => { if (active) setError(error instanceof Error ? error.message : "Could not load achievements."); });
    return () => { active = false; element?.close(); };
  }, [playerId, game.titleRowId]);

  return <dialog ref={dialog} className="game-dialog xbox-dialog" onClose={onClose} aria-labelledby="xbox-dialog-title">
    <div className="game-dialog-header"><span className="eyebrow"><Trophy size={14}/> XBOX ACHIEVEMENTS</span><button className="dialog-close" type="button" aria-label="Close achievements" onClick={() => dialog.current?.close()}><X size={20}/></button></div>
    <div className="game-dialog-scroll">
      <div className="xbox-dialog-intro"><Cover src={game.coverUrl} name={game.name}/><div><h2 id="xbox-dialog-title">{game.name}</h2>
        <p>{game.currentAchievements} of {game.totalAchievements} achievements · {game.currentGamerscore.toLocaleString()} / {game.totalGamerscore.toLocaleString()}G</p></div></div>
      {error ? <p className="game-dialog-error" role="alert">{error}</p> : !achievements ? <p className="game-dialog-loading xbox-dialog-status"><LoaderCircle className="spin" size={16}/> Loading achievements…</p>
        : !achievements.length ? <p className="xbox-dialog-status">Achievements haven’t synced yet.</p>
        : <ul className="xbox-achievement-list">{achievements.map((achievement) => <li key={achievement.id} className={achievement.unlockedAt ? "is-unlocked" : undefined}>
          <span className="xbox-achievement-icon">{achievement.iconUrl && (achievement.unlockedAt || !achievement.isSecret) ? <img src={achievement.iconUrl} alt="" loading="lazy"/> : achievement.unlockedAt ? <Trophy size={20} aria-hidden="true"/> : <Lock size={20} aria-hidden="true"/>}</span>
          <span className="xbox-achievement-copy"><strong>{achievement.name}</strong>{achievement.description && <span>{achievement.description}</span>}
            <small>{achievement.unlockedAt ? `Unlocked ${new Date(achievement.unlockedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : "Locked"}{achievement.rarity !== null ? ` · ${(achievement.rarity / 10).toLocaleString()}% of players` : ""}</small></span>
          <span className="xbox-achievement-score">{achievement.gamerscore}G</span>
        </li>)}</ul>}
    </div>
  </dialog>;
}
