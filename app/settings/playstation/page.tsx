import { requireUser } from "../../auth";
import SiteHeader from "../../site-header";
import PsnSettings from "./psn-settings";
import { hasPermission } from "../../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function PlayStationPage() {
  const user = await requireUser("/settings/playstation");
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={hasPermission(user, false)}/>
    <div className="library-wrap settings-wrap steam-wrap"><a className="inline-link" href="/settings">Settings & friends</a><h1>Your PlayStation games</h1>
      <PsnSettings/></div>
  </main>;
}
