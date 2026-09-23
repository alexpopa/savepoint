import { requireChatGPTUser } from "../chatgpt-auth";
import Settings from "./settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireChatGPTUser("/settings");
  return <Settings email={user.email} />;
}
