"use client";

import { useEffect, useRef, useState } from "react";
import { Award, Gamepad2, LoaderCircle, Lock, Trophy, X } from "lucide-react";
import { formatPlaytime, type PsnShowcaseGame, type PsnShowcaseTotals, type PsnTrophy } from "../lib/psn-types";

const gradeLabels = { platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze" };

function Cover({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="xbox-cover">{src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)}/> : <span className="cover-fallback"><Gamepad2 size={24} aria-hidden="true"/><span>{name.slice(0, 1)}</span></span>}</span>;
}

function totalsLine(totals: PsnShowcaseTotals) {
  return [totals.level ? `Level ${totals.level.toLocaleString()}` : null, `${totals.platinum.toLocaleString()} platinum`, `${totals.gold.toLocaleString()} gold`,
    `${totals.silver.toLocaleString()} silver`, `${totals.bronze.toLocaleString()} bronze`, `${totals.completed.toLocaleString()} completed`].filter(Boolean).join(" · ");
}

// Added PlayStation games with trophies, most recently played first. Hidden when the player has none.
export default function PsnTrophies({ playerId, games, totals }: { playerId: string; games: PsnShowcaseGame[]; totals: PsnShowcaseTotals }) {
  const [selected, setSelected] = useState<PsnShowcaseGame | null>(null);
  if (!games.length) return null;
  return <section className="profile-section" aria-labelledby="psn-title">
    <div className="profile-section-head">
      <h2 id="psn-title" className="profile-label"><Trophy size={15} aria-hidden="true"/>PlayStation trophies</h2>
      <p className="xbox-totals">{totalsLine(totals)}</p>
    </div>
    <ul className="xbox-showcase">
      {games.map((game) => <li key={game.titleRowId}>
        <button type="button" className="xbox-game" aria-haspopup="dialog" onClick={() => setSelected(game)}>
          <Cover src={game.coverUrl} name={game.name}/>
          <span className="xbox-game-copy">
            <span className="xbox-game-name">{game.name}</span>
            <span className="xbox-game-meta">{game.completedAt ? <><Award size={14} aria-hidden="true"/> {game.hasPlatinum ? "Platinum" : "All trophies"}</> : `${game.earnedTrophies} of ${game.totalTrophies} trophies`}</span>
            <progress className="xbox-progress" aria-label={`${game.name} trophy progress`} value={game.earnedTrophies} max={game.totalTrophies}/>
            <span className="xbox-game-meta">{formatPlaytime(game.playSeconds) ?? game.platformName}</span>
          </span>
        </button>
      </li>)}
    </ul>
    {selected && <TrophiesDialog playerId={playerId} game={selected} onClose={() => setSelected(null)}/>}
  </section>;
}

function TrophiesDialog({ playerId, game, onClose }: { playerId: string; game: PsnShowcaseGame; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [trophies, setTrophies] = useState<PsnTrophy[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    void fetch(`/api/psn/trophies?player=${encodeURIComponent(playerId)}&title=${game.titleRowId}`).then(async (response) => {
      const data = await response.json() as { trophies?: PsnTrophy[]; error?: string };
      if (!response.ok || !data.trophies) throw new Error(data.error || "Could not load trophies.");
      if (active) setTrophies(data.trophies);
    }).catch((error) => { if (active) setError(error instanceof Error ? error.message : "Could not load trophies."); });
    return () => { active = false; element?.close(); };
  }, [playerId, game.titleRowId]);

  const playtime = formatPlaytime(game.playSeconds);
  return <dialog ref={dialog} className="game-dialog xbox-dialog" onClose={onClose} aria-labelledby="psn-dialog-title">
    <div className="game-dialog-header"><span className="eyebrow"><Trophy size={14}/> PLAYSTATION TROPHIES</span><button className="dialog-close" type="button" aria-label="Close trophies" onClick={() => dialog.current?.close()}><X size={20}/></button></div>
    <div className="game-dialog-scroll">
      <div className="xbox-dialog-intro"><Cover src={game.coverUrl} name={game.name}/><div><h2 id="psn-dialog-title">{game.name}</h2>
        <p>{game.earnedTrophies} of {game.totalTrophies} trophies{playtime ? ` · ${playtime}` : ""}</p></div></div>
      {error ? <p className="game-dialog-error" role="alert">{error}</p> : !trophies ? <p className="game-dialog-loading xbox-dialog-status"><LoaderCircle className="spin" size={16}/> Loading trophies…</p>
        : !trophies.length ? <p className="xbox-dialog-status">Trophies haven’t synced yet.</p>
        : <ul className="xbox-achievement-list">{trophies.map((trophy) => <li key={trophy.id} className={trophy.earnedAt ? "is-unlocked" : undefined}>
          <span className="xbox-achievement-icon">{trophy.iconUrl && (trophy.earnedAt || !trophy.isHidden) ? <img src={trophy.iconUrl} alt="" loading="lazy"/> : trophy.earnedAt ? <Trophy size={20} aria-hidden="true"/> : <Lock size={20} aria-hidden="true"/>}</span>
          <span className="xbox-achievement-copy"><strong>{trophy.name}</strong>{trophy.description && <span>{trophy.description}</span>}
            <small>{trophy.earnedAt ? `Earned ${new Date(trophy.earnedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : "Locked"}{trophy.rarity !== null ? ` · ${(trophy.rarity / 10).toLocaleString()}% of players` : ""}{trophy.groupId !== "default" ? " · Add-on" : ""}</small></span>
          <span className="xbox-achievement-score">{gradeLabels[trophy.grade]}</span>
        </li>)}</ul>}
    </div>
  </dialog>;
}
