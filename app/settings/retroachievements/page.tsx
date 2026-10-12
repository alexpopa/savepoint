import { requireUser } from "../../auth";
import SiteHeader from "../../site-header";
import RaSettings from "./ra-settings";
import { hasPermission } from "../../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function RetroAchievementsPage() {
  const user = await requireUser("/settings/retroachievements");
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={hasPermission(user, false)}/>
    <div className="library-wrap settings-wrap steam-wrap"><a className="inline-link" href="/connections">Connected libraries</a><h1>Your RetroAchievements games</h1>
      <RaSettings/></div>
  </main>;
}
