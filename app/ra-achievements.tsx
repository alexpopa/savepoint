"use client";

import { useEffect, useRef, useState } from "react";
import { Award, Gamepad2, LoaderCircle, Lock, Trophy, X } from "lucide-react";
import { formatPlaytime } from "../lib/psn-types";
import type { RaAchievement, RaShowcaseGame, RaShowcaseTotals } from "../lib/ra-types";

function Cover({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="xbox-cover">{src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)}/> : <span className="cover-fallback"><Gamepad2 size={24} aria-hidden="true"/><span>{name.slice(0, 1)}</span></span>}</span>;
}

function Badge({ achievement }: { achievement: RaAchievement }) {
  const [failed, setFailed] = useState(false);
  // RA publishes a greyed "_lock" version of every badge for achievements not yet earned.
  const src = achievement.badgeUrl && (achievement.earnedAt ? achievement.badgeUrl : achievement.badgeUrl.replace(/\.png$/, "_lock.png"));
  return <span className="xbox-achievement-icon">{src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)}/> : achievement.earnedAt ? <Trophy size={20} aria-hidden="true"/> : <Lock size={20} aria-hidden="true"/>}</span>;
}

// Every total is stored; the profile shows only games beaten for now.
function totalsLine(totals: RaShowcaseTotals) {
  const beaten = totals.beatenHardcore + totals.beatenSoftcore;
  return `${beaten.toLocaleString()} ${beaten === 1 ? "game" : "games"} beaten`;
}

// Added RetroAchievements games, most recently played first. Hidden when the player has none.
export default function RaAchievements({ playerId, games, totals }: { playerId: string; games: RaShowcaseGame[]; totals: RaShowcaseTotals }) {
  const [selected, setSelected] = useState<RaShowcaseGame | null>(null);
  if (!games.length) return null;
  return <section className="profile-section" aria-labelledby="ra-title">
    <div className="profile-section-head">
      <h2 id="ra-title" className="profile-label"><Trophy size={15} aria-hidden="true"/>RetroAchievements</h2>
      <p className="xbox-totals">{totalsLine(totals)}</p>
    </div>
    <ul className="xbox-showcase">
      {games.map((game) => <li key={game.gameRowId}>
        <button type="button" className="xbox-game" aria-haspopup="dialog" onClick={() => setSelected(game)}>
          <Cover src={game.coverUrl} name={game.name}/>
          <span className="xbox-game-copy">
            <span className="xbox-game-name">{game.name}</span>
            <span className="xbox-game-meta">{game.completedAt ? <><Award size={14} aria-hidden="true"/> {game.completedHardcore ? "Beaten · Hardcore" : "Beaten"}</> : `${game.earned} of ${game.total} achievements`}</span>
            <progress className="xbox-progress" aria-label={`${game.name} achievement progress`} value={game.earned} max={game.total}/>
            <span className="xbox-game-meta">{formatPlaytime(game.playSeconds) ?? game.platformName}</span>
          </span>
        </button>
      </li>)}
    </ul>
    {selected && <AchievementsDialog playerId={playerId} game={selected} onClose={() => setSelected(null)}/>}
  </section>;
}

function AchievementsDialog({ playerId, game, onClose }: { playerId: string; game: RaShowcaseGame; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [achievements, setAchievements] = useState<RaAchievement[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    void fetch(`/api/ra/achievements?player=${encodeURIComponent(playerId)}&game=${game.gameRowId}`).then(async (response) => {
      const data = await response.json() as { achievements?: RaAchievement[]; error?: string };
      if (!response.ok || !data.achievements) throw new Error(data.error || "Could not load achievements.");
      if (active) setAchievements(data.achievements);
    }).catch((error) => { if (active) setError(error instanceof Error ? error.message : "Could not load achievements."); });
    return () => { active = false; element?.close(); };
  }, [playerId, game.gameRowId]);

  const playtime = formatPlaytime(game.playSeconds);
  return <dialog ref={dialog} className="game-dialog xbox-dialog" onClose={onClose} aria-labelledby="ra-dialog-title">
    <div className="game-dialog-header"><span className="eyebrow"><Trophy size={14}/> RETROACHIEVEMENTS</span><button className="dialog-close" type="button" aria-label="Close achievements" onClick={() => dialog.current?.close()}><X size={20}/></button></div>
    <div className="game-dialog-scroll">
      <div className="xbox-dialog-intro"><Cover src={game.coverUrl} name={game.name}/><div><h2 id="ra-dialog-title">{game.name}</h2>
        <p>{game.earned} of {game.total} achievements{playtime ? ` · ${playtime}` : ""}</p></div></div>
      {error ? <p className="game-dialog-error" role="alert">{error}</p> : !achievements ? <p className="game-dialog-loading xbox-dialog-status"><LoaderCircle className="spin" size={16}/> Loading achievements…</p>
        : !achievements.length ? <p className="xbox-dialog-status">Achievements haven’t synced yet.</p>
        : <ul className="xbox-achievement-list">{achievements.map((achievement) => <li key={achievement.id} className={achievement.earnedAt ? "is-unlocked" : undefined}>
          <Badge achievement={achievement}/>
          <span className="xbox-achievement-copy"><strong>{achievement.title}</strong>{achievement.description && <span>{achievement.description}</span>}
            <small>{[achievement.earnedAt ? `Earned ${new Date(achievement.earnedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : "Locked",
              achievement.hardcore ? "Hardcore" : null, achievement.rarity !== null ? `${(achievement.rarity / 10).toLocaleString()}% of players` : null,
              achievement.setName ? `Subset: ${achievement.setName}` : null].filter(Boolean).join(" · ")}</small></span>
          <span className="xbox-achievement-score">{achievement.points} pts</span>
        </li>)}</ul>}
    </div>
  </dialog>;
}
