import { getCurrentUser } from "../../../auth";
import { getDb } from "../../../../db";
import { copyPage, copyQueryParams, libraryCopiesQuery, libraryCopyPlatformsQuery, libraryGamesQuery, parseCopyFilters, type CopyPlatform, type LibraryCopy, type LibraryGame } from "../../../../lib/library-copies-query";
import { privateResponse } from "../../../../lib/social";

// A searchable page of the viewer's own library: platform copies by default, or one row per game with `group=game`.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to view your library." }, { status: 401 });
  const filters = parseCopyFilters(new URL(request.url).searchParams);
  if (!filters) return Response.json({ error: "Invalid search, platform, or page." }, { status: 400 });
  try {
    const client = getDb().$client;
    const params = copyQueryParams(user.userId, filters);
    // The viewer's own platforms come with the first page of copies only; later pages reuse them.
    const [rows, platforms] = await Promise.all([
      filters.group === "game"
        ? client.prepare(libraryGamesQuery).bind(...params).all<LibraryGame & { id: number; addedAt: number }>()
        : client.prepare(libraryCopiesQuery).bind(...params).all<LibraryCopy & { addedAt: number }>(),
      filters.cursor || filters.group === "game" ? null : client.prepare(libraryCopyPlatformsQuery).bind(user.userId).all<CopyPlatform>(),
    ]);
    return Response.json({ ...copyPage<{ id: number; addedAt: number }>(rows.results), ...(platforms && { platforms: platforms.results }) }, { headers: privateResponse });
  } catch { return Response.json({ error: "Your library is temporarily unavailable." }, { status: 503 }); }
}
