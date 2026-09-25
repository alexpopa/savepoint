import { getCurrentUser } from "../auth";
import { redirect } from "next/navigation";
import Library from "../library";
import { ensureAccount } from "../../lib/social";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return_to=%2Flibrary");
  await ensureAccount(user);
  return <Library email={user.email} userId={user.userId} />;
}
