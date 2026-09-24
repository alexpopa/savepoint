import { listIgdbPlatforms } from "../../../../lib/igdb";

export async function GET() {
  try {
    return Response.json({ platforms: await listIgdbPlatforms() }, {
      headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "IGDB platforms are unavailable right now." }, { status: 502 });
  }
}
