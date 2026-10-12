import { raPlatformIds } from "./ra-types.ts";

// Writes carry the connection generation and lease token, like Steam, Xbox, and PlayStation: a disconnect
// or newer operation makes in-flight writes harmless, including after HTTP timeouts.
const leased = (connection: string, token: string, now: string) => `EXISTS (SELECT 1 FROM ra_connections WHERE connection_id = ${connection} AND lock_token = ${token} AND lock_until > ${now})`;

export const acquireRaLock = `
UPDATE ra_connections SET lock_token = ?2, lock_until = ?3
WHERE user_id = ?1 AND (lock_until IS NULL OR lock_until < ?4)
RETURNING *`;

// One RetroAchievements account per RGBoner account and the other way round.
export const linkRaConnection = `
INSERT INTO ra_connections (user_id, connection_id, ulid, username, linked_at)
VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING`;

// Completion keeps its earliest time once set, so a revised set never reopens a beaten game.
export const saveRaGame = `
INSERT INTO ra_games (connection_id, game_id, subset_ids_json, name, console_id, console_name, image_url, earned, earned_hardcore, total, last_played_at, observed_at,
  completed_at, completed_hardcore)
SELECT connection_id, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15 FROM ra_connections
WHERE connection_id = ?1 AND lock_token = ?2 AND lock_until > ?16
ON CONFLICT(connection_id, game_id) DO UPDATE SET subset_ids_json = excluded.subset_ids_json, name = excluded.name, console_id = excluded.console_id,
  console_name = excluded.console_name, image_url = excluded.image_url, earned = excluded.earned, earned_hardcore = excluded.earned_hardcore, total = excluded.total,
  last_played_at = excluded.last_played_at, observed_at = excluded.observed_at,
  completed_at = COALESCE(min(completed_at, excluded.completed_at), completed_at, excluded.completed_at),
  completed_hardcore = max(completed_hardcore, excluded.completed_hardcore)`;

export const setRaMatch = `UPDATE ra_games SET game_json = ?1, matched_at = ?2
WHERE connection_id = ?3 AND game_id = ?4 AND ${leased("?3", "?5", "?2")}`;

export const importRaGame = `
INSERT INTO library_items (user_id, igdb_id, name, cover_url, release_year, platforms_json, platform_id, platform_name, added_at, updated_at)
SELECT c.user_id, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11
FROM ra_connections c JOIN ra_games g USING (connection_id)
WHERE c.connection_id = ?1 AND c.lock_token = ?2 AND c.lock_until > ?11
  AND g.game_id = ?3 AND g.observed_at = c.synced_at AND g.library_item_id IS NULL
ON CONFLICT(user_id, igdb_id, platform_id) DO UPDATE SET updated_at = excluded.updated_at`;

const ownCopy = `SELECT l.id FROM library_items l JOIN ra_connections c ON c.user_id = l.user_id
  WHERE c.connection_id = ?1 AND l.igdb_id = ?4 AND l.platform_id = ?5`;
export const attachRaGame = `
UPDATE ra_games SET library_item_id = (${ownCopy}), imported_at = COALESCE(imported_at, ?6)
WHERE connection_id = ?1 AND game_id = ?3
  AND observed_at = (SELECT synced_at FROM ra_connections WHERE connection_id = ?1)
  AND EXISTS (${ownCopy}) AND ${leased("?1", "?2", "?6")}`;

// Marking again keeps the original time, matching the library's own currently-playing write.
export const playRaGame = `
UPDATE library_items SET playing_since = COALESCE(playing_since, ?6)
WHERE id = (${ownCopy}) AND ${leased("?1", "?2", "?6")}
  AND EXISTS (SELECT 1 FROM ra_games WHERE connection_id = ?1 AND game_id = ?3 AND library_item_id = library_items.id)`;

export const raPlatformMatch = (column: string) => `EXISTS (SELECT 1 FROM json_each(${column}, '$.platformOptions') p WHERE json_extract(p.value, '$.id') IN (${raPlatformIds.join(", ")}))`;
const current = "g.observed_at = c.synced_at";
export const raReady = `g.library_item_id IS NULL AND ${current} AND ${raPlatformMatch("g.game_json")}`;
export const raUnresolved = `g.library_item_id IS NULL AND ${current} AND g.matched_at IS NOT NULL AND (g.game_json IS NULL OR NOT ${raPlatformMatch("g.game_json")})`;
// Added games whose unlock counts changed since their achievement lists were last read.
export const raAchievementsStale = `g.library_item_id IS NOT NULL AND ${current} AND g.total > 0
  AND (g.achievements_synced_count IS NULL OR g.achievements_synced_count <> g.earned + g.earned_hardcore)`;

export const raCounts = `SELECT
  COALESCE(sum(CASE WHEN g.library_item_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS imported,
  COALESCE(sum(CASE WHEN ${raReady} THEN 1 ELSE 0 END), 0) AS ready,
  COALESCE(sum(CASE WHEN ${raUnresolved} THEN 1 ELSE 0 END), 0) AS unresolved,
  COALESCE(sum(CASE WHEN g.matched_at IS NULL AND ${current} THEN 1 ELSE 0 END), 0) AS pending,
  COALESCE(sum(CASE WHEN ${raAchievementsStale} THEN 1 ELSE 0 END), 0) AS achievementsPending
FROM ra_games g JOIN ra_connections c USING (connection_id) WHERE c.user_id = ?`;

export const readyRaGames = `SELECT g.game_id AS gameId, g.game_json AS gameJson, g.console_id AS consoleId
FROM ra_games g JOIN ra_connections c USING (connection_id)
WHERE c.connection_id = ? AND ${raReady} ORDER BY g.last_played_at DESC, g.game_id LIMIT 30`;

// One request per set, so three games per batch keeps the shared API key well under RA's rate limit.
export const staleRaAchievements = `SELECT g.id, g.game_id AS gameId, g.subset_ids_json AS subsetIdsJson
FROM ra_games g JOIN ra_connections c USING (connection_id)
WHERE c.connection_id = ? AND ${raAchievementsStale} ORDER BY g.last_played_at DESC, g.id LIMIT 3`;

export const saveRaAchievement = `
INSERT INTO ra_achievements (achievement_id, game_id, set_name, title, description, badge_url, points, display_order, rarity, checked_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
ON CONFLICT(achievement_id) DO UPDATE SET game_id = excluded.game_id, set_name = excluded.set_name, title = excluded.title, description = excluded.description,
  badge_url = excluded.badge_url, points = excluded.points, display_order = excluded.display_order, rarity = COALESCE(excluded.rarity, rarity), checked_at = excluded.checked_at`;

// An unlock keeps its first recorded time, so rereading a list never bumps the timeline; a later hardcore unlock only adds the mark.
export const saveRaUnlock = `
INSERT INTO ra_unlocks (game_row_id, user_id, achievement_id, earned_at, hardcore)
SELECT g.id, c.user_id, ?4, ?5, ?6 FROM ra_games g JOIN ra_connections c USING (connection_id)
WHERE g.id = ?3 AND c.connection_id = ?1 AND c.lock_token = ?2 AND c.lock_until > ?7
ON CONFLICT(game_row_id, achievement_id) DO UPDATE SET hardcore = max(hardcore, excluded.hardcore)`;

export const finishRaAchievements = `
UPDATE ra_games SET achievements_synced_count = earned + earned_hardcore, play_seconds = COALESCE(?4, play_seconds)
WHERE id = ?3 AND connection_id = ?1 AND ${leased("?1", "?2", "?5")}`;

export const raShowcaseQuery = `SELECT g.id AS gameRowId, l.igdb_id AS igdbId, l.name, l.cover_url AS coverUrl, l.release_year AS releaseYear,
    l.platform_name AS platformName, g.earned, g.total, g.play_seconds AS playSeconds, g.last_played_at AS lastPlayedAt,
    g.completed_at AS completedAt, g.completed_hardcore AS completedHardcore
  FROM ra_connections c JOIN ra_games g USING (connection_id) JOIN library_items l ON l.id = g.library_item_id
  WHERE c.user_id = ?1 AND g.total > 0
  ORDER BY g.last_played_at IS NULL, g.last_played_at DESC, g.id DESC LIMIT ?2`;

// Points and award counts are RA's account-wide totals; games counts added games only.
export const raShowcaseTotals = `SELECT c.hardcore_points AS hardcorePoints, c.softcore_points AS softcorePoints, c.retro_points AS retroPoints,
    c.beaten_hardcore AS beatenHardcore, c.beaten_softcore AS beatenSoftcore, c.mastered, c.completed,
    (SELECT count(*) FROM ra_games g WHERE g.connection_id = c.connection_id AND g.library_item_id IS NOT NULL AND g.total > 0) AS games
  FROM ra_connections c WHERE c.user_id = ?1`;

// The main set and its subsets; earned first, newest first, then RA's own order.
export const raAchievementListQuery = `SELECT a.achievement_id AS id, a.set_name AS setName, a.title, a.description, a.badge_url AS badgeUrl, a.points, a.rarity,
    u.earned_at AS earnedAt, COALESCE(u.hardcore, 0) AS hardcore
  FROM ra_connections c JOIN ra_games g USING (connection_id)
  JOIN ra_achievements a ON a.game_id = g.game_id OR a.game_id IN (SELECT value FROM json_each(g.subset_ids_json))
  LEFT JOIN ra_unlocks u ON u.game_row_id = g.id AND u.achievement_id = a.achievement_id
  WHERE c.user_id = ?1 AND g.id = ?2 AND g.library_item_id IS NOT NULL
  ORDER BY u.earned_at IS NULL, u.earned_at DESC, a.set_name IS NOT NULL, a.display_order, a.achievement_id LIMIT 2000`;

const views = { all: "1", ready: raReady, unresolved: raUnresolved, imported: "g.library_item_id IS NOT NULL" };
export type RaView = keyof typeof views;
export const raViews = Object.keys(views) as RaView[];
// Most recently played first, so the top of every view doubles as recent activity.
const pageFrom = (view: RaView) => `FROM ra_games g JOIN ra_connections c USING (connection_id) LEFT JOIN library_items l ON l.id = g.library_item_id
  WHERE c.user_id = ?1 AND (?2 = '' OR instr(lower(g.name), lower(?2)) > 0) AND ${views[view]}`;
export const raPageCount = (view: RaView) => `SELECT count(*) AS total ${pageFrom(view)}`;
export const raPage = (view: RaView) => `SELECT g.game_id AS gameId, g.name, g.console_name AS consoleName, g.image_url AS imageUrl,
    g.last_played_at AS lastPlayedAt, g.play_seconds AS playSeconds, g.earned, g.earned_hardcore AS earnedHardcore, g.total,
    g.completed_at AS completedAt, g.completed_hardcore AS completedHardcore, g.game_json AS gameJson, g.matched_at AS matchedAt,
    g.imported_at AS importedAt, g.library_item_id AS libraryItemId, l.playing_since AS playingSince, g.observed_at = c.synced_at AS available
  ${pageFrom(view)} ORDER BY g.last_played_at IS NULL, g.last_played_at DESC, g.name, g.game_id LIMIT 30 OFFSET ?3`;

// Removes every library copy this connection added or linked. RetroAchievements never adds anything on its own, so removed games are ready to add again.
export const removeRaCopies = `
DELETE FROM library_items WHERE user_id = ?1 AND id IN (
  SELECT g.library_item_id FROM ra_games g JOIN ra_connections c ON c.connection_id = g.connection_id
  WHERE c.connection_id = ?2 AND c.lock_token = ?3 AND g.library_item_id IS NOT NULL)`;
