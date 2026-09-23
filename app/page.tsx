import { requireChatGPTUser } from "./chatgpt-auth";
import Library from "./library";
import { ensureAccount } from "../lib/social";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  await ensureAccount(user);
  return <Library email={user.email} />;
}
