import { and, eq, isNotNull } from "drizzle-orm";
import { requireUser } from "../auth";
import { getDb } from "../../db";
import { accounts } from "../../db/schema";
import { ensureAccount, getSocialState } from "../../lib/social";
import SiteHeader from "../site-header";
import { accountDisplayName } from "../../lib/social";
import { profilePath } from "../../lib/profile-path";
import { hasPermission } from "../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireUser("/users");
  await ensureAccount(user);
  const canBrowseAll = hasPermission(user, false);
  const [visibleAccounts, relations] = await Promise.all([
    getDb().select().from(accounts).where(and(...(canBrowseAll ? [] : [eq(accounts.isPublic, true)]), isNotNull(accounts.passwordHash), isNotNull(accounts.emailVerifiedAt))),
    getSocialState(user.userId),
  ]);
  const visible = new Map<string, { userId: string; displayName: string; email: string; isPublic: boolean }>();
  for (const account of visibleAccounts) if (account.userId !== user.userId) visible.set(account.userId, account);
  for (const person of relations) if (person.status === "accepted") visible.set(person.userId, person);
  const people = [...visible.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const friendIds = new Set(relations.filter((person) => person.status === "accepted").map((person) => person.userId));
  return <main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap settings-wrap"><p className="eyebrow">COMMUNITY</p><h1>Browse players</h1><p className="subcopy">{canBrowseAll ? "Explore player libraries. Search above to find any player." : "Explore public libraries and libraries shared by your friends. Search above to find any player."}</p><div className="people-grid">{people.length ? people.map((person) => <a className="player-card" key={person.userId} href={profilePath(person)}><span className="account-avatar">{accountDisplayName(person).charAt(0).toUpperCase()}</span><span><strong>{accountDisplayName(person)}</strong><small>{person.isPublic ? "Public library" : friendIds.has(person.userId) ? "Friend · Private library" : "Private library"}</small></span></a>) : <div className="empty-state"><h2>No libraries to browse yet</h2><p>Use search above to find players and send a friend request.</p></div>}</div></div></main>;
}
