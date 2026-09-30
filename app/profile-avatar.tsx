"use client";

import { useEffect, useState } from "react";

export const profileTopGameEvent = "rgb-profile-top-game-change";
type ProfileAvatarGame = { name: string; coverUrl: string | null };

const avatarInks = ["var(--rgb-action)", "var(--rgb-info)", "var(--rgb-danger)", "var(--rgb-ink)"];

// FNV-1a keeps each player's fallback avatar stable without storing anything new.
function hash(value: string, seed = 2166136261) {
  let result = seed;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

// A mirrored 5 × 5 sprite on a one-cell black margin, drawn at an integer scale.
function PixelAvatar({ seed }: { seed: string }) {
  const bits = hash(seed);
  const ink = avatarInks[hash(seed, 3339675911) % avatarInks.length];
  const cells: [number, number][] = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 3; column++) {
      if (((bits >> (row * 3 + column)) & 1) === 0) continue;
      cells.push([column, row]);
      if (column < 2) cells.push([4 - column, row]);
    }
  }
  if (cells.length < 5) cells.push([2, 0], [1, 1], [3, 1], [2, 2], [1, 3], [3, 3], [2, 4]);
  return <svg className="pixel-avatar" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
    <rect width="7" height="7" fill="var(--rgb-black)"/>
    {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width="1" height="1" fill={ink}/>)}
  </svg>;
}

export default function ProfileAvatar({ seed, game }: { seed: string; game?: ProfileAvatarGame }) {
  const [failed, setFailed] = useState(false);
  const [topGame, setTopGame] = useState(game);
  useEffect(() => {
    const updateTopGame = (event: Event) => {
      setTopGame((event as CustomEvent<ProfileAvatarGame | undefined>).detail);
      setFailed(false);
    };
    window.addEventListener(profileTopGameEvent, updateTopGame);
    return () => window.removeEventListener(profileTopGameEvent, updateTopGame);
  }, []);
  return <div className="profile-avatar">
    {topGame?.coverUrl && !failed
      ? <img className="profile-avatar-cover" src={topGame.coverUrl} alt={`#1 Top 10 game: ${topGame.name}`} onError={() => setFailed(true)}/>
      : <PixelAvatar seed={seed}/>}
  </div>;
}
