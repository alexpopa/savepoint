import { getCurrentUser } from "./auth";
import { redirect } from "next/navigation";
import Library from "./library";
import { ensureAccount } from "../lib/social";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/search");
  await ensureAccount(user);
  return <Library email={user.email} userId={user.userId} />;
}
