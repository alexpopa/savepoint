import { getCurrentUser } from "./auth";
import { redirect } from "next/navigation";
import { ensureAccount } from "../lib/social";
import { getTimeline } from "../lib/timeline";
import Timeline from "./timeline";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/search");
  await ensureAccount(user);
  let items: Awaited<ReturnType<typeof getTimeline>> = [];
  let error = false;
  try {
    items = await getTimeline(user);
  } catch {
    error = true;
  }
  return <Timeline email={user.email} viewerId={user.userId} items={items} error={error} />;
}
