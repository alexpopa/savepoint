import { searchIgdb } from "../../../../lib/igdb";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const rawPlatformIds = params.getAll("platform");
  if (query.length < 2 || query.length > 100) return Response.json({ error: "Search must be between 2 and 100 characters." }, { status: 400 });
  const platformIds = rawPlatformIds.map(Number);
  if (platformIds.some((id) => !Number.isSafeInteger(id) || id < 1))
    return Response.json({ error: "Choose valid platforms." }, { status: 400 });
  try { return Response.json({ games: await searchIgdb(query, [...new Set(platformIds)]) }, { headers: { "cache-control": "private, no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "IGDB search failed." }, { status: 502 }); }
}
