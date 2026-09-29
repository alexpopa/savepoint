export const copyPageSize = 10;
export const maxPlatformFilters = 50;

export type LibraryCopy = { id: number; igdbId: number; name: string; coverUrl: string | null; platformName: string | null };
export type LibraryGame = { igdbId: number; name: string; coverUrl: string | null; platformNames: string };
export type CopyPlatform = { id: number; name: string };
export type CopyFilters = { query: string | null; platformIds: number[]; group: "copy" | "game"; cursor: { addedAt: number; id: number } | null };

// Keyset pagination on (added_at, id) stays stable while copies are added, and never scans skipped pages.
// One extra row is read to tell whether another page exists. ?3 is a JSON array of platform IDs, or null.
export const libraryCopiesQuery = `SELECT id, igdb_id AS igdbId, name, cover_url AS coverUrl, platform_name AS platformName, added_at AS addedAt
  FROM library_items
  WHERE user_id = ?1
    AND (?2 IS NULL OR name LIKE ?2 ESCAPE '\\')
    AND (?3 IS NULL OR platform_id IN (SELECT value FROM json_each(?3)))
    AND (?4 IS NULL OR added_at < ?4 OR (added_at = ?4 AND id < ?5))
  ORDER BY added_at DESC, id DESC
  LIMIT ${copyPageSize + 1}`;

// One row per game, for pickers where the platform copy does not matter (the Top 10).
// Name and cover come from the newest copy; the page key is that copy's time and the IGDB ID.
export const libraryGamesQuery = `WITH games AS (
    SELECT igdb_id, MAX(added_at) AS added_at, GROUP_CONCAT(COALESCE(platform_name, 'Platform not set'), ' · ') AS platform_names
    FROM library_items
    WHERE user_id = ?1
      AND (?2 IS NULL OR name LIKE ?2 ESCAPE '\\')
      AND (?3 IS NULL OR platform_id IN (SELECT value FROM json_each(?3)))
    GROUP BY igdb_id
  )
  SELECT games.igdb_id AS id, games.igdb_id AS igdbId, latest.name, latest.cover_url AS coverUrl, games.platform_names AS platformNames, games.added_at AS addedAt
  FROM games
  JOIN library_items AS latest ON latest.id = (
    SELECT id FROM library_items WHERE user_id = ?1 AND igdb_id = games.igdb_id ORDER BY added_at DESC, id DESC LIMIT 1
  )
  WHERE ?4 IS NULL OR games.added_at < ?4 OR (games.added_at = ?4 AND games.igdb_id < ?5)
  ORDER BY games.added_at DESC, games.igdb_id DESC
  LIMIT ${copyPageSize + 1}`;

export const libraryCopyPlatformsQuery = `SELECT platform_id AS id, COALESCE(MAX(platform_name), 'Platform not set') AS name
  FROM library_items WHERE user_id = ?1 GROUP BY platform_id ORDER BY name COLLATE NOCASE`;

// Returns null for malformed input so the route can answer 400 instead of guessing.
export function parseCopyFilters(params: URLSearchParams): CopyFilters | null {
  const query = (params.get("q") ?? "").trim().slice(0, 100) || null;
  const rawPlatforms = params.getAll("platform");
  const platformIds = [...new Set(rawPlatforms.map((value) => /^\d+$/.test(value) ? Number(value) : NaN))];
  if (platformIds.some((id) => !Number.isSafeInteger(id)) || platformIds.length > maxPlatformFilters) return null;
  const rawGroup = params.get("group");
  if (rawGroup !== null && rawGroup !== "game") return null;
  const group = rawGroup === "game" ? "game" : "copy";
  const rawCursor = params.get("cursor");
  if (!rawCursor) return { query, platformIds, group, cursor: null };
  if (!/^\d+\.\d+$/.test(rawCursor)) return null;
  const [addedAt, id] = rawCursor.split(".").map(Number);
  if (!Number.isSafeInteger(addedAt) || !Number.isSafeInteger(id)) return null;
  return { query, platformIds, group, cursor: { addedAt, id } };
}

// Search matches a substring of the title; %, _, and \ typed by the player are literal.
export function copySearchPattern(query: string | null) {
  return query === null ? null : `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

export function copyQueryParams(userId: string, filters: CopyFilters) {
  return [userId, copySearchPattern(filters.query), filters.platformIds.length ? JSON.stringify(filters.platformIds) : null, filters.cursor?.addedAt ?? null, filters.cursor?.id ?? null];
}

export function copyPage<T extends { id: number; addedAt: number }>(rows: T[]) {
  const page = rows.slice(0, copyPageSize);
  const last = page.at(-1);
  return {
    // The page key is only needed for `next`; undefined drops it from the JSON response.
    items: page.map((row) => ({ ...row, addedAt: undefined })),
    next: rows.length > copyPageSize && last ? `${last.addedAt}.${last.id}` : null,
  };
}
