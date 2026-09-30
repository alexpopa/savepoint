import { notFound } from "next/navigation";
import { getCurrentUser } from "../auth";
import SiteHeader from "../site-header";
import { getSiteStats, recentDays } from "../../lib/admin";
import type { SiteStats } from "../../lib/admin-queries";
import { hasPermission } from "../../lib/permissions";

export const dynamic = "force-dynamic";

type Stat = { label: string; key: keyof SiteStats };

const sections: { title: string; stats: Stat[] }[] = [
  { title: "Players", stats: [{ label: "Verified players", key: "players" }, { label: "Public profiles", key: "publicPlayers" }, { label: "Awaiting verification", key: "unverified" }, { label: "With an active session", key: "signedIn" }] },
  { title: "Libraries", stats: [{ label: "Distinct games", key: "games" }, { label: "Saved platform copies", key: "copies" }, { label: "Currently playing", key: "playing" }, { label: "Completed copies", key: "completed" }, { label: "Top 10 favorites", key: "favorites" }, { label: "Scores", key: "ratings" }] },
  { title: "Social", stats: [{ label: "Challenges", key: "challenges" }, { label: "Challenges cleared", key: "clearedChallenges" }, { label: "Friendships", key: "friendships" }, { label: "Pending friend requests", key: "pendingRequests" }] },
  { title: `Last ${recentDays} days`, stats: [{ label: "Copies added", key: "recentCopies" }, { label: "Challenges sent", key: "recentChallenges" }, { label: "Games scored", key: "recentRatings" }, { label: "Friend requests sent", key: "recentFriendships" }] },
];

export default async function AdminPage() {
  const user = await getCurrentUser();
  // Everyone else gets the ordinary 404, so the page does not reveal that it exists.
  if (!hasPermission(user, false)) notFound();
  let stats: SiteStats | null = null;
  try { stats = await getSiteStats(); } catch (error) { console.error("Could not load site stats", error); }
  return <main className="library-page"><SiteHeader email={user?.email} showAdmin/><div className="library-wrap settings-wrap admin-wrap">
    <p className="eyebrow">ADMIN</p>
    <h1>Site overview</h1>
    <p className="subcopy">Totals across every account. Only admins can open this page.</p>
    {stats ? sections.map((section) => <section className="settings-card admin-section" key={section.title} aria-labelledby={`admin-${section.stats[0].key}`}>
      <h2 id={`admin-${section.stats[0].key}`}>{section.title}</h2>
      <dl className="admin-stats">{section.stats.map((stat) => <div key={stat.key}><dt>{stat.label}</dt><dd>{stats[stat.key].toLocaleString("en-US")}</dd></div>)}</dl>
    </section>) : <p className="notice error" role="alert">Could not load site stats. Please try again.</p>}
  </div></main>;
}
