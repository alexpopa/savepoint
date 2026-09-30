import { getCurrentUser } from "../../../auth";
import { getThread, sendMessage } from "../../../../lib/messages";
import { messageLengthLimit } from "../../../../lib/message-queries";
import { parseMessageBody, parseMessageId } from "../../../../lib/message-view";
import { isSameOriginWrite } from "../../../../lib/request-security";
import { privateResponse } from "../../../../lib/social";

type Context = { params: Promise<{ userId: string }> };

// Without a cursor: the newest page. `before` pages back through history; `after` returns newer messages for polling.
export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to read messages." }, { status: 401 });
  const { userId } = await context.params;
  const params = new URL(request.url).searchParams;
  const rawBefore = params.get("before");
  const rawAfter = params.get("after");
  const before = rawBefore === null ? undefined : parseMessageId(rawBefore);
  const after = rawAfter === null ? undefined : parseMessageId(rawAfter);
  if (before === null || after === null || (before !== undefined && after !== undefined))
    return Response.json({ error: "Invalid message page." }, { status: 400 });
  try {
    const thread = await getThread(user.userId, userId, { before, after });
    if (!thread) return Response.json({ error: "You can message only your friends." }, { status: 403 });
    return Response.json(thread, { headers: privateResponse });
  } catch { return Response.json({ error: "Messages couldn’t load. Please try again." }, { status: 503 }); }
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to send messages." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const { userId } = await context.params;
  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const body = parseMessageBody((payload as { body?: unknown } | null)?.body, messageLengthLimit);
  if (body === null) return Response.json({ error: `Write a message of 1 to ${messageLengthLimit} characters.` }, { status: 400 });
  try {
    const message = await sendMessage(user.userId, userId, body);
    if (!message) return Response.json({ error: "You can message only your friends." }, { status: 403 });
    return Response.json({ message }, { headers: privateResponse });
  } catch { return Response.json({ error: "Your message wasn’t sent. Please try again." }, { status: 503 }); }
}
