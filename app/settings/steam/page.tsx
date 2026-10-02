import { requireUser } from "../../auth";
import SiteHeader from "../../site-header";
import SteamSettings from "./steam-settings";
import { hasPermission } from "../../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function SteamPage() {
  const user = await requireUser("/settings/steam");
  return <main className="library-page"><SiteHeader email={user.email} showAdmin={hasPermission(user, false)}/>
    <div className="library-wrap settings-wrap steam-wrap"><a className="inline-link" href="/settings">Settings & friends</a><h1>Your Steam collection</h1>
      <SteamSettings/></div>
  </main>;
}
