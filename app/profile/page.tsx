import { requireUser } from "../auth";
import { ChallengeSections } from "../challenges";
import SiteHeader from "../site-header";
import { receivedChallenges, sentChallenges } from "../../lib/challenges";
import { accountDisplayName, ensureAccount } from "../../lib/social";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const account = await ensureAccount(user);
  const [received, sent] = await Promise.all([receivedChallenges(user.userId), sentChallenges(user.userId)]);
  return <main className="library-page"><SiteHeader email={user.email}/><div className="library-wrap"><div className="page-heading"><div><p className="eyebrow">YOUR PROFILE</p><h1>{accountDisplayName(account)}&apos;s challenges</h1><p className="subcopy">Favorite and rank your challenges within Pending and Completed. Only friends can view this profile unless your account is public.</p></div></div><ChallengeSections rows={received} viewerId={user.userId} ownerControls title="Challenges for you"/><ChallengeSections rows={sent} viewerId={user.userId} title="Challenges you created"/></div></main>;
}
