import type { ReactNode } from "react";
import { Globe, Lock, UserCheck } from "lucide-react";

export type ProfileStatus = "private" | "public" | "friend";
export type ProfileStat = { label: string; value: number; href?: string };

const avatarInks = ["var(--rgb-action)", "var(--rgb-info)", "var(--rgb-danger)", "var(--rgb-ink)"];

// FNV-1a keeps each player's avatar stable without storing anything new.
function hash(value: string, seed = 2166136261) {
  let result = seed;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

// A mirrored 5 × 5 sprite on a one-cell black margin, drawn at an integer scale.
export function PixelAvatar({ seed }: { seed: string }) {
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

const statusIcons = { private: Lock, public: Globe, friend: UserCheck };
const statusLabels = { private: "Private", public: "Public", friend: "Friend" };

export function ProfileNameplate({ seed, name, status, statusHref, stats, children }: { seed: string; name: string; status: ProfileStatus; statusHref?: string; stats?: ProfileStat[]; children?: ReactNode }) {
  const StatusIcon = statusIcons[status];
  const chip = <><StatusIcon size={13} aria-hidden="true"/>{statusLabels[status]}</>;
  return <header className="profile-plate">
    <PixelAvatar seed={seed}/>
    <div className="profile-plate-id">
      {statusHref
        ? <a className="profile-chip" href={statusHref} title="Change who can view your profile">{chip}</a>
        : <p className="profile-chip">{chip}</p>}
      <h1>{name}</h1>
      {stats && <dl className="profile-stats">{stats.map((stat) => <div key={stat.label}>
        <dt>{stat.label}</dt>
        <dd>{stat.href ? <a href={stat.href}>{stat.value.toString().padStart(2, "0")}</a> : stat.value.toString().padStart(2, "0")}</dd>
      </div>)}</dl>}
    </div>
    {children && <div className="profile-plate-actions">{children}</div>}
  </header>;
}
