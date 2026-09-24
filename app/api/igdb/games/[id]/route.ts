import { getIgdbGame } from "../../../../../lib/igdb";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid game." }, { status: 400 });
  try {
    const game = await getIgdbGame(id);
    if (!game) return Response.json({ error: "Game not found in IGDB." }, { status: 404 });
    return Response.json({ game }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Game details are unavailable." }, { status: 502 }); }
}
