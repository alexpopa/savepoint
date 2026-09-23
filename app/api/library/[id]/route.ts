import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { libraryItems } from "../../../../db/schema";
import { isSameOriginWrite } from "../../../../lib/request-security";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to remove games." }, { status: 401 });
  if (!isSameOriginWrite(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid library item." }, { status: 400 });
  try {
    await getDb().delete(libraryItems).where(and(eq(libraryItems.id, id), eq(libraryItems.userId, user.userId)));
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "Could not remove the game." }, { status: 503 }); }
}
