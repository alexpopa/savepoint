import { getCurrentUser } from "../../../../auth";
import { markMessagesRead } from "../../../../../lib/messages";
import { parseMessageId } from "../../../../../lib/message-view";
import { isSameOriginWrite } from "../../../../../lib/request-security";
import { privateResponse } from "../../../../../lib/social";

type Context = { params: Promise<{ userId: string }> };

// Marks this friend's messages read up to the newest one the viewer has loaded, and returns the remaining unread count.
export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to read messages." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const { userId } = await context.params;
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const rawUpTo = (payload as { upTo?: unknown } | null)?.upTo;
  const upTo = typeof rawUpTo === "number" ? parseMessageId(rawUpTo) : null;
  if (upTo === null) return Response.json({ error: "Invalid message." }, { status: 400 });
  try {
    return Response.json({ count: await markMessagesRead(user.userId, userId, upTo) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Could not mark messages as read." }, { status: 503 }); }
}
