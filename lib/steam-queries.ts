import { steamPlatformIds } from "./steam-types.ts";

// All long-running writes carry the connection generation and lease token. A disconnect,
// relink, or newer operation makes in-flight writes harmless, including after HTTP timeouts.
export const acquireSteamLock = `
UPDATE steam_connections SET lock_token = ?2, lock_until = ?3
WHERE user_id = ?1 AND (lock_until IS NULL OR lock_until < ?4)
RETURNING *`;

export const saveSteamGame = `
INSERT INTO steam_games (connection_id, app_id, name, playtime_minutes, recent_minutes, last_played_at, observed_at)
SELECT connection_id, ?3, ?4, ?5, ?6, ?7, ?8 FROM steam_connections
WHERE connection_id = ?1 AND lock_token = ?2 AND lock_until > ?9
ON CONFLICT(connection_id, app_id) DO UPDATE SET name = excluded.name,
  playtime_minutes = excluded.playtime_minutes, recent_minutes = excluded.recent_minutes,
  last_played_at = excluded.last_played_at, observed_at = excluded.observed_at`;

export const importSteamGame = `
INSERT INTO library_items (user_id, igdb_id, name, cover_url, release_year, platforms_json, platform_id, platform_name, added_at, updated_at)
SELECT c.user_id, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11
FROM steam_connections c JOIN steam_games g USING (connection_id)
WHERE c.connection_id = ?1 AND c.lock_token = ?2 AND c.lock_until > ?11
  AND g.app_id = ?3 AND g.ignored = 0 AND g.observed_at = c.synced_at AND g.library_item_id IS NULL
ON CONFLICT(user_id, igdb_id, platform_id) DO UPDATE SET updated_at = excluded.updated_at`;

export const attachSteamGame = `
UPDATE steam_games SET library_item_id = (
  SELECT l.id FROM library_items l JOIN steam_connections c ON c.user_id = l.user_id
  WHERE c.connection_id = ?1 AND l.igdb_id = ?4 AND l.platform_id = ?5
), imported_at = COALESCE(imported_at, ?6)
WHERE connection_id = ?1 AND app_id = ?3 AND ignored = 0
  AND observed_at = (SELECT synced_at FROM steam_connections WHERE connection_id = ?1)
  AND EXISTS (SELECT 1 FROM library_items l JOIN steam_connections c ON c.user_id = l.user_id
    WHERE c.connection_id = ?1 AND l.igdb_id = ?4 AND l.platform_id = ?5)
  AND EXISTS (SELECT 1 FROM steam_connections WHERE connection_id = ?1 AND lock_token = ?2 AND lock_until > ?6)`;

export const linkSteamConnection = `
INSERT INTO steam_connections (user_id, connection_id, steam_id, linked_at)
SELECT user_id, ?4, ?5, ?3 FROM steam_link_states
WHERE user_id = ?1 AND state_hash = ?2 AND expires_at > ?3
ON CONFLICT DO NOTHING`;
export const consumeSteamState = `DELETE FROM steam_link_states WHERE user_id = ?1 AND state_hash = ?2`;

const desktopMatch = `EXISTS (SELECT 1 FROM json_each(g.game_json, '$.platformOptions') p WHERE json_extract(p.value, '$.id') IN (${steamPlatformIds.join(", ")}))`;
const readyMatch = `g.ignored = 0 AND g.library_item_id IS NULL AND g.imported_at IS NULL AND g.observed_at = c.synced_at AND ${desktopMatch}`;
export const steamMatchCounts = `SELECT
  COALESCE(sum(CASE WHEN g.library_item_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS imported,
  COALESCE(sum(CASE WHEN ${readyMatch} THEN 1 ELSE 0 END), 0) AS ready,
  COALESCE(sum(CASE WHEN g.ignored = 0 AND g.library_item_id IS NULL AND g.observed_at = c.synced_at AND g.matched_at IS NOT NULL AND NOT ${desktopMatch} THEN 1 ELSE 0 END), 0) AS review
FROM steam_games g JOIN steam_connections c USING (connection_id) WHERE c.user_id = ?`;
export const readySteamGames = `SELECT g.app_id, g.game_json FROM steam_games g JOIN steam_connections c USING (connection_id)
WHERE c.connection_id = ? AND ${readyMatch} ORDER BY g.app_id LIMIT 30`;

export const setSteamMatch = `UPDATE steam_games SET game_json = ?1, matched_at = ?2, ignored = 0
WHERE connection_id = ?3 AND app_id = ?4
AND EXISTS (SELECT 1 FROM steam_connections WHERE connection_id = ?3 AND lock_token = ?5 AND lock_until > ?2)`;


// Start from one user's update index, then look up linked Steam rows. No catalog JSON scan or sort.
const recentlyUpdatedFrom = `FROM library_items l INDEXED BY idx_library_user_updated_at
CROSS JOIN steam_games g INDEXED BY idx_steam_connection_library
WHERE l.user_id = ?1 AND l.updated_at IS NOT NULL AND g.connection_id = ?2 AND g.library_item_id = l.id
AND (?3 = '' OR instr(lower(g.name), lower(?3)) > 0)`;
export const recentSteamCount = `SELECT count(*) AS total ${recentlyUpdatedFrom}`;
export const recentSteamGames = `SELECT g.app_id AS appId ${recentlyUpdatedFrom}
ORDER BY l.updated_at DESC, l.id DESC LIMIT 30 OFFSET ?4`;
