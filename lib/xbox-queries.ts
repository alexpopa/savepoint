import { xboxPlatformIds } from "./xbox-types.ts";

// Writes carry the connection generation and lease token, like Steam: a disconnect, relink,
// or newer operation makes in-flight writes harmless, including after HTTP timeouts.
const leased = (connection: string, token: string, now: string) => `EXISTS (SELECT 1 FROM xbox_connections WHERE connection_id = ${connection} AND lock_token = ${token} AND lock_until > ${now})`;

export const acquireXboxLock = `
UPDATE xbox_connections SET lock_token = ?2, lock_until = ?3
WHERE user_id = ?1 AND (lock_until IS NULL OR lock_until < ?4)
RETURNING *`;

export const saveXboxToken = `UPDATE xbox_connections SET token_cipher = ?3 WHERE connection_id = ?1 AND lock_token = ?2 AND lock_until > ?4`;

export const saveXboxTitle = `
INSERT INTO xbox_titles (connection_id, title_id, name, image_url, product_id, devices_json, last_played_at,
  current_achievements, total_achievements, current_gamerscore, total_gamerscore, achievement_version, observed_at)
SELECT connection_id, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14 FROM xbox_connections
WHERE connection_id = ?1 AND lock_token = ?2 AND lock_until > ?15
ON CONFLICT(connection_id, title_id) DO UPDATE SET name = excluded.name, image_url = excluded.image_url,
  product_id = excluded.product_id, devices_json = excluded.devices_json, last_played_at = excluded.last_played_at,
  current_achievements = excluded.current_achievements, total_achievements = excluded.total_achievements,
  current_gamerscore = excluded.current_gamerscore, total_gamerscore = excluded.total_gamerscore,
  achievement_version = excluded.achievement_version, observed_at = excluded.observed_at`;

export const setXboxMatch = `UPDATE xbox_titles SET game_json = ?1, matched_at = ?2
WHERE connection_id = ?3 AND title_id = ?4 AND ${leased("?3", "?5", "?2")}`;

export const importXboxGame = `
INSERT INTO library_items (user_id, igdb_id, name, cover_url, release_year, platforms_json, platform_id, platform_name, added_at, updated_at)
SELECT c.user_id, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11
FROM xbox_connections c JOIN xbox_titles t USING (connection_id)
WHERE c.connection_id = ?1 AND c.lock_token = ?2 AND c.lock_until > ?11
  AND t.title_id = ?3 AND t.observed_at = c.synced_at AND t.library_item_id IS NULL
ON CONFLICT(user_id, igdb_id, platform_id) DO UPDATE SET updated_at = excluded.updated_at`;

const ownCopy = `SELECT l.id FROM library_items l JOIN xbox_connections c ON c.user_id = l.user_id
  WHERE c.connection_id = ?1 AND l.igdb_id = ?4 AND l.platform_id = ?5`;
export const attachXboxGame = `
UPDATE xbox_titles SET library_item_id = (${ownCopy}), imported_at = COALESCE(imported_at, ?6)
WHERE connection_id = ?1 AND title_id = ?3
  AND observed_at = (SELECT synced_at FROM xbox_connections WHERE connection_id = ?1)
  AND EXISTS (${ownCopy}) AND ${leased("?1", "?2", "?6")}`;

// Marking again keeps the original time, matching the library's own currently-playing write.
export const playXboxGame = `
UPDATE library_items SET playing_since = COALESCE(playing_since, ?6)
WHERE id = (${ownCopy}) AND ${leased("?1", "?2", "?6")}
  AND EXISTS (SELECT 1 FROM xbox_titles WHERE connection_id = ?1 AND title_id = ?3 AND library_item_id = library_items.id)`;

export const linkXboxConnection = `
INSERT INTO xbox_connections (user_id, connection_id, xuid, gamertag, token_cipher, linked_at)
SELECT user_id, ?4, ?5, ?6, ?7, ?3 FROM xbox_link_states
WHERE user_id = ?1 AND state_hash = ?2 AND expires_at > ?3
ON CONFLICT DO NOTHING`;
export const consumeXboxState = `DELETE FROM xbox_link_states WHERE user_id = ?1 AND state_hash = ?2`;

export const xboxPlatformMatch = (column: string) => `EXISTS (SELECT 1 FROM json_each(${column}, '$.platformOptions') p WHERE json_extract(p.value, '$.id') IN (${xboxPlatformIds.join(", ")}))`;
const current = "t.observed_at = c.synced_at";
export const xboxReady = `t.library_item_id IS NULL AND ${current} AND ${xboxPlatformMatch("t.game_json")}`;
export const xboxUnresolved = `t.library_item_id IS NULL AND ${current} AND t.matched_at IS NOT NULL AND (t.game_json IS NULL OR NOT ${xboxPlatformMatch("t.game_json")})`;
// Titles whose earned count changed since their achievement list was last read.
export const xboxAchievementsStale = `t.library_item_id IS NOT NULL AND ${current} AND t.total_achievements > 0
  AND (t.achievements_synced_count IS NULL OR t.achievements_synced_count <> t.current_achievements)`;

export const xboxCounts = `SELECT
  COALESCE(sum(CASE WHEN t.library_item_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS imported,
  COALESCE(sum(CASE WHEN ${xboxReady} THEN 1 ELSE 0 END), 0) AS ready,
  COALESCE(sum(CASE WHEN ${xboxUnresolved} THEN 1 ELSE 0 END), 0) AS unresolved,
  COALESCE(sum(CASE WHEN t.matched_at IS NULL AND ${current} THEN 1 ELSE 0 END), 0) AS pending,
  COALESCE(sum(CASE WHEN ${xboxAchievementsStale} THEN 1 ELSE 0 END), 0) AS achievementsPending
FROM xbox_titles t JOIN xbox_connections c USING (connection_id) WHERE c.user_id = ?`;

export const readyXboxGames = `SELECT t.title_id AS titleId, t.game_json AS gameJson, t.devices_json AS devicesJson
FROM xbox_titles t JOIN xbox_connections c USING (connection_id)
WHERE c.connection_id = ? AND ${xboxReady} ORDER BY t.last_played_at DESC, t.title_id LIMIT 30`;

export const staleXboxAchievements = `SELECT t.id, t.title_id AS titleId, t.achievement_version AS achievementVersion
FROM xbox_titles t JOIN xbox_connections c USING (connection_id)
WHERE c.connection_id = ? AND ${xboxAchievementsStale} ORDER BY t.last_played_at DESC, t.id LIMIT 5`;

export const saveXboxAchievement = `
INSERT INTO xbox_achievements (title_id, achievement_id, name, description, icon_url, gamerscore, is_secret, rarity, sort_order, checked_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
ON CONFLICT(title_id, achievement_id) DO UPDATE SET name = excluded.name, description = excluded.description, icon_url = excluded.icon_url,
  gamerscore = excluded.gamerscore, is_secret = excluded.is_secret, rarity = excluded.rarity, sort_order = excluded.sort_order, checked_at = excluded.checked_at`;

// An unlock keeps its first recorded time, so rereading a list never bumps the timeline.
export const saveXboxUnlock = `
INSERT INTO xbox_unlocks (title_row_id, user_id, achievement_id, unlocked_at)
SELECT t.id, c.user_id, ?4, ?5 FROM xbox_titles t JOIN xbox_connections c USING (connection_id)
WHERE t.id = ?3 AND c.connection_id = ?1 AND c.lock_token = ?2 AND c.lock_until > ?6
ON CONFLICT(title_row_id, achievement_id) DO NOTHING`;

// Completion is the final unlock time, and only while every listed achievement is earned.
export const finishXboxAchievements = `
UPDATE xbox_titles SET achievements_synced_count = current_achievements,
  completed_at = CASE WHEN ?4 > 0 AND (SELECT count(*) FROM xbox_unlocks WHERE title_row_id = ?3) >= ?4
    THEN (SELECT max(unlocked_at) FROM xbox_unlocks WHERE title_row_id = ?3) ELSE NULL END
WHERE id = ?3 AND connection_id = ?1 AND ${leased("?1", "?2", "?5")}`;

export const xboxShowcaseQuery = `SELECT t.id AS titleRowId, l.igdb_id AS igdbId, l.name, l.cover_url AS coverUrl, l.release_year AS releaseYear,
    l.platform_name AS platformName, t.current_achievements AS currentAchievements, t.total_achievements AS totalAchievements,
    t.current_gamerscore AS currentGamerscore, t.total_gamerscore AS totalGamerscore, t.last_played_at AS lastPlayedAt,
    CASE WHEN t.current_achievements = t.total_achievements THEN t.completed_at END AS completedAt
  FROM xbox_connections c JOIN xbox_titles t USING (connection_id) JOIN library_items l ON l.id = t.library_item_id
  WHERE c.user_id = ?1 AND t.total_achievements > 0
  ORDER BY t.last_played_at IS NULL, t.last_played_at DESC, t.id DESC LIMIT ?2`;

export const xboxShowcaseTotals = `SELECT count(*) AS games, COALESCE(sum(t.current_gamerscore), 0) AS gamerscore,
    COALESCE(sum(CASE WHEN t.completed_at IS NOT NULL AND t.current_achievements = t.total_achievements THEN 1 ELSE 0 END), 0) AS completed
  FROM xbox_connections c JOIN xbox_titles t USING (connection_id)
  WHERE c.user_id = ?1 AND t.library_item_id IS NOT NULL AND t.total_achievements > 0`;

// Unearned secret achievements stay hidden; earned first, newest first, then Xbox's own order.
export const xboxAchievementListQuery = `SELECT a.achievement_id AS id,
    CASE WHEN a.is_secret AND u.unlocked_at IS NULL THEN 'Secret achievement' ELSE a.name END AS name,
    CASE WHEN a.is_secret AND u.unlocked_at IS NULL THEN NULL ELSE a.description END AS description,
    a.icon_url AS iconUrl, a.gamerscore, a.is_secret AS isSecret, a.rarity, u.unlocked_at AS unlockedAt
  FROM xbox_connections c JOIN xbox_titles t USING (connection_id)
  JOIN xbox_achievements a ON a.title_id = t.title_id
  LEFT JOIN xbox_unlocks u ON u.title_row_id = t.id AND u.achievement_id = a.achievement_id
  WHERE c.user_id = ?1 AND t.id = ?2 AND t.library_item_id IS NOT NULL
  ORDER BY u.unlocked_at IS NULL, u.unlocked_at DESC, a.sort_order LIMIT 1000`;

const views = { all: "1", ready: xboxReady, unresolved: xboxUnresolved, imported: "t.library_item_id IS NOT NULL" };
export type XboxView = keyof typeof views;
export const xboxViews = Object.keys(views) as XboxView[];
// Most recently played first, so the top of every view doubles as recent activity.
const pageFrom = (view: XboxView) => `FROM xbox_titles t JOIN xbox_connections c USING (connection_id) LEFT JOIN library_items l ON l.id = t.library_item_id
  WHERE c.user_id = ?1 AND (?2 = '' OR instr(lower(t.name), lower(?2)) > 0) AND ${views[view]}`;
export const xboxPageCount = (view: XboxView) => `SELECT count(*) AS total ${pageFrom(view)}`;
export const xboxPage = (view: XboxView) => `SELECT t.title_id AS titleId, t.name, t.image_url AS imageUrl, t.devices_json AS devicesJson,
    t.last_played_at AS lastPlayedAt, t.current_achievements AS currentAchievements, t.total_achievements AS totalAchievements,
    t.current_gamerscore AS currentGamerscore, t.total_gamerscore AS totalGamerscore, t.game_json AS gameJson, t.matched_at AS matchedAt,
    t.imported_at AS importedAt, t.library_item_id AS libraryItemId, l.playing_since AS playingSince, t.observed_at = c.synced_at AS available
  ${pageFrom(view)} ORDER BY t.last_played_at IS NULL, t.last_played_at DESC, t.name, t.title_id LIMIT 30 OFFSET ?3`;

// Removes every library copy this connection added or linked. Xbox never adds anything on its own, so removed games are ready to add again.
export const removeXboxCopies = `
DELETE FROM library_items WHERE user_id = ?1 AND id IN (
  SELECT t.library_item_id FROM xbox_titles t JOIN xbox_connections c ON c.connection_id = t.connection_id
  WHERE c.connection_id = ?2 AND c.lock_token = ?3 AND t.library_item_id IS NOT NULL)`;
