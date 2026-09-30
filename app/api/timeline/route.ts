import { getCurrentUser } from "../../auth";
import { getTimelinePage } from "../../../lib/timeline";
import { parseTimelineCursor } from "../../../lib/timeline-items";
import { privateResponse } from "../../../lib/social";

// Older friend activity after the cursor the previous page returned; the home page renders the first page itself.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to see friend activity." }, { status: 401 });
  const rawCursor = new URL(request.url).searchParams.get("cursor");
  const cursor = rawCursor === null ? null : parseTimelineCursor(rawCursor);
  if (rawCursor !== null && !cursor) return Response.json({ error: "Invalid timeline page." }, { status: 400 });
  try {
    return Response.json(await getTimelinePage(user, cursor), { headers: privateResponse });
  } catch { return Response.json({ error: "More activity couldn’t load. Please try again." }, { status: 503 }); }
}
