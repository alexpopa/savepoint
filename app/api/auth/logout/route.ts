import { clearSessionCookie, deleteSession } from "../../../auth";
import { isSameOriginWrite } from "../../../../lib/request-security";

export async function POST(request: Request) {
  if (!isSameOriginWrite(request)) return new Response(null, { status: 403 });
  try {
    await deleteSession(request);
  } catch {
    return new Response("Sign out is temporarily unavailable.", { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  return new Response(null, { status: 303, headers: { location: "/login", "cache-control": "private, no-store", "set-cookie": clearSessionCookie(request) } });
}
