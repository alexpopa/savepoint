import { getCurrentUser } from "./auth";
import { redirect } from "next/navigation";
import { ensureAccount } from "../lib/social";
import { getTimelinePage } from "../lib/timeline";
import Timeline from "./timeline";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/search");
  await ensureAccount(user);
  let page: Awaited<ReturnType<typeof getTimelinePage>> = { items: [], next: null };
  let error = false;
  try {
    page = await getTimelinePage(user, null);
  } catch {
    error = true;
  }
  return <Timeline email={user.email} viewerId={user.userId} items={page.items} next={page.next} error={error} />;
}
