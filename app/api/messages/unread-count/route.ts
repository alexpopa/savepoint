import { getCurrentUser } from "../../../auth";
import { getUnreadMessageCount } from "../../../../lib/messages";
import { privateResponse } from "../../../../lib/social";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to see unread messages." }, { status: 401 });
  try {
    return Response.json({ count: await getUnreadMessageCount(user.userId) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Unread messages are temporarily unavailable." }, { status: 503 }); }
}
