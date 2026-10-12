import { requireUser } from "../../auth";
import SiteHeader from "../../site-header";
import XboxSettings from "./xbox-settings";
import { hasPermission } from "../../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function XboxPage() {
  const user = await requireUser("/settings/xbox");
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={hasPermission(user, false)}/>
    <div className="library-wrap settings-wrap steam-wrap"><a className="inline-link" href="/settings">Settings & friends</a><h1>Your Xbox games</h1>
      <XboxSettings/></div>
  </main>;
}
