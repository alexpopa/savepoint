import type { ReactNode } from "react";
import { Globe, Lock, UserCheck } from "lucide-react";
import ProfileAvatar from "./profile-avatar";

export type ProfileStatus = "private" | "public" | "friend";
export type ProfileStat = { label: string; value: number; href?: string };

const statusIcons = { private: Lock, public: Globe, friend: UserCheck };
const statusLabels = { private: "Private", public: "Public", friend: "Friend" };

export function ProfileNameplate({ seed, name, status, statusHref, stats, topGame, children }: { seed: string; name: string; status: ProfileStatus; statusHref?: string; stats?: ProfileStat[]; topGame?: { name: string; coverUrl: string | null }; children?: ReactNode }) {
  const StatusIcon = statusIcons[status];
  const chip = <><StatusIcon size={13} aria-hidden="true"/>{statusLabels[status]}</>;
  return <header className="profile-plate">
    <ProfileAvatar seed={seed} game={topGame}/>
    <div className="profile-plate-id">
      <h1>{name}</h1>
      <div className="profile-meta">
        {statusHref
          ? <a className="profile-chip" href={statusHref} title="Change who can view your profile">{chip}</a>
          : <p className="profile-chip">{chip}</p>}
        {stats && <dl className="profile-stats">{stats.map((stat) => <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.href ? <a href={stat.href}>{stat.value}</a> : stat.value}</dd>
        </div>)}</dl>}
      </div>
    </div>
    {children && <div className="profile-plate-actions">{children}</div>}
  </header>;
}
