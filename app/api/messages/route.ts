import { getCurrentUser } from "../../auth";
import { getConversations } from "../../../lib/messages";
import { privateResponse } from "../../../lib/social";

// The messages page polls this while open, so unread counts and previews stay current for every friend.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to see your messages." }, { status: 401 });
  try {
    return Response.json({ conversations: await getConversations(user.userId) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Messages couldn’t load. Please try again." }, { status: 503 }); }
}
