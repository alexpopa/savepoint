import { requireUser } from "../auth";
import Settings from "./settings";
import { hasPermission } from "../../lib/permissions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  return <Settings email={user.email} showAdmin={hasPermission(user, false)} />;
}
