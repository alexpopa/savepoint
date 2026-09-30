import { getCurrentUser } from "./auth";
import { redirect } from "next/navigation";
import { getTimelinePage } from "../lib/timeline";
import Timeline from "./timeline";
import { hasPermission } from "../lib/permissions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/search");
  let page: Awaited<ReturnType<typeof getTimelinePage>> = { items: [], next: null };
  let error = false;
  try {
    page = await getTimelinePage(user, null);
  } catch {
    error = true;
  }
  return <Timeline email={user.email} viewerId={user.userId} showAdmin={hasPermission(user, false)} items={page.items} next={page.next} error={error} />;
}
