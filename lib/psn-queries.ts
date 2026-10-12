import { psnPlatformIds } from "./psn-types.ts";

// Writes carry the connection generation and lease token, like Steam and Xbox: a disconnect, reconnect,
// or newer operation makes in-flight writes harmless, including after HTTP timeouts.
const leased = (connection: string, token: string, now: string) => `EXISTS (SELECT 1 FROM psn_connections WHERE connection_id = ${connection} AND lock_token = ${token} AND lock_until > ${now})`;

export const acquirePsnLock = `
UPDATE psn_connections SET lock_token = ?2, lock_until = ?3
WHERE user_id = ?1 AND (lock_until IS NULL OR lock_until < ?4)
RETURNING *`;

export const savePsnToken = `UPDATE psn_connections SET token_cipher = ?3 WHERE connection_id = ?1 AND lock_token = ?2 AND lock_until > ?4`;

// A connection is created once per RGBoner account and PSN account; reconnecting keeps its ID and data.
export const linkPsnConnection = `
INSERT INTO psn_connections (user_id, connection_id, account_id, online_id, token_cipher, linked_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT DO NOTHING`;
export const reconnectPsnConnection = `
UPDATE psn_connections SET token_cipher = ?4, online_id = ?3, needs_reconnect = 0, sync_error = NULL
WHERE user_id = ?1 AND account_id = ?2`;

export const savePsnTitle = `
INSERT INTO psn_titles (connection_id, title_key, name, image_url, platforms_json, np_communication_id, np_service_name, concept_id, title_ids_json, links_checked,
  last_played_at, play_seconds, earned_platinum, earned_gold, earned_silver, earned_bronze, defined_platinum, defined_gold, defined_silver, defined_bronze, progress, observed_at)
SELECT connection_id, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23 FROM psn_connections
WHERE connection_id = ?1 AND lock_token = ?2 AND lock_until > ?24
ON CONFLICT(connection_id, title_key) DO UPDATE SET name = excluded.name, image_url = excluded.image_url, platforms_json = excluded.platforms_json,
  np_communication_id = excluded.np_communication_id, np_service_name = excluded.np_service_name, concept_id = excluded.concept_id,
  title_ids_json = excluded.title_ids_json, links_checked = max(links_checked, excluded.links_checked),
  last_played_at = excluded.last_played_at, play_seconds = excluded.play_seconds,
  earned_platinum = excluded.earned_platinum, earned_gold = excluded.earned_gold, earned_silver = excluded.earned_silver, earned_bronze = excluded.earned_bronze,
  defined_platinum = excluded.defined_platinum, defined_gold = excluded.defined_gold, defined_silver = excluded.defined_silver, defined_bronze = excluded.defined_bronze,
  progress = excluded.progress, observed_at = excluded.observed_at`;

// When Sony later links a played game to its trophy list, the trophy row takes over the earlier played-only row's
// match, and its library copy when that copy is on one of the row's platforms; the played-only row then goes away.
const sharesTitle = (row: string) => `${row}.title_key LIKE 'concept:%' AND ${row}.connection_id = psn_titles.connection_id
  AND EXISTS (SELECT 1 FROM json_each(${row}.title_ids_json) a JOIN json_each(psn_titles.title_ids_json) b ON a.value = b.value)`;
const rowPlatformIds = `(SELECT CASE p.value WHEN 'PS5' THEN 167 WHEN 'PS4' THEN 48 WHEN 'PS3' THEN 9 WHEN 'PSVITA' THEN 46 END FROM json_each(psn_titles.platforms_json) p)`;
const formerCopy = (column: string) => `(SELECT o.${column} FROM psn_titles o JOIN library_items l ON l.id = o.library_item_id WHERE ${sharesTitle("o")} AND l.platform_id IN ${rowPlatformIds} LIMIT 1)`;
const formerMatch = (column: string) => `(SELECT o.${column} FROM psn_titles o WHERE ${sharesTitle("o")} AND o.matched_at IS NOT NULL LIMIT 1)`;
export const adoptPsnTitles = `
UPDATE psn_titles SET imported_at = CASE WHEN library_item_id IS NULL THEN COALESCE(${formerCopy("imported_at")}, imported_at) ELSE imported_at END,
  library_item_id = COALESCE(library_item_id, ${formerCopy("library_item_id")}),
  game_json = CASE WHEN matched_at IS NULL THEN ${formerMatch("game_json")} ELSE game_json END,
  matched_at = COALESCE(matched_at, ${formerMatch("matched_at")})
WHERE connection_id = ?1 AND np_communication_id IS NOT NULL AND observed_at = ?3
  AND EXISTS (SELECT 1 FROM psn_titles o WHERE ${sharesTitle("o")}) AND ${leased("?1", "?2", "?3")}`;
export const dropAdoptedPsnTitles = `
DELETE FROM psn_titles WHERE connection_id = ?1 AND title_key LIKE 'concept:%'
  AND EXISTS (SELECT 1 FROM psn_titles n, json_each(n.title_ids_json) a JOIN json_each(psn_titles.title_ids_json) b ON a.value = b.value
    WHERE n.connection_id = ?1 AND n.np_communication_id IS NOT NULL AND n.observed_at = ?3)
  AND ${leased("?1", "?2", "?3")}`;

export const setPsnMatch = `UPDATE psn_titles SET game_json = ?1, matched_at = ?2
WHERE connection_id = ?3 AND title_key = ?4 AND ${leased("?3", "?5", "?2")}`;

export const importPsnGame = `
INSERT INTO library_items (user_id, igdb_id, name, cover_url, release_year, platforms_json, platform_id, platform_name, added_at, updated_at)
SELECT c.user_id, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11
FROM psn_connections c JOIN psn_titles t USING (connection_id)
WHERE c.connection_id = ?1 AND c.lock_token = ?2 AND c.lock_until > ?11
  AND t.title_key = ?3 AND t.observed_at = c.synced_at AND t.library_item_id IS NULL
ON CONFLICT(user_id, igdb_id, platform_id) DO UPDATE SET updated_at = excluded.updated_at`;

const ownCopy = `SELECT l.id FROM library_items l JOIN psn_connections c ON c.user_id = l.user_id
  WHERE c.connection_id = ?1 AND l.igdb_id = ?4 AND l.platform_id = ?5`;
export const attachPsnGame = `
UPDATE psn_titles SET library_item_id = (${ownCopy}), imported_at = COALESCE(imported_at, ?6)
WHERE connection_id = ?1 AND title_key = ?3
  AND observed_at = (SELECT synced_at FROM psn_connections WHERE connection_id = ?1)
  AND EXISTS (${ownCopy}) AND ${leased("?1", "?2", "?6")}`;

// Marking again keeps the original time, matching the library's own currently-playing write.
export const playPsnGame = `
UPDATE library_items SET playing_since = COALESCE(playing_since, ?6)
WHERE id = (${ownCopy}) AND ${leased("?1", "?2", "?6")}
  AND EXISTS (SELECT 1 FROM psn_titles WHERE connection_id = ?1 AND title_key = ?3 AND library_item_id = library_items.id)`;

const earned = "(t.earned_platinum + t.earned_gold + t.earned_silver + t.earned_bronze)";
const defined = "(t.defined_platinum + t.defined_gold + t.defined_silver + t.defined_bronze)";
export const psnPlatformMatch = (column: string) => `EXISTS (SELECT 1 FROM json_each(${column}, '$.platformOptions') p WHERE json_extract(p.value, '$.id') IN (${psnPlatformIds.join(", ")}))`;
const current = "t.observed_at = c.synced_at";
export const psnReady = `t.library_item_id IS NULL AND ${current} AND ${psnPlatformMatch("t.game_json")}`;
export const psnUnresolved = `t.library_item_id IS NULL AND ${current} AND t.matched_at IS NOT NULL AND (t.game_json IS NULL OR NOT ${psnPlatformMatch("t.game_json")})`;
// Added games whose earned count changed since their trophy list was last read.
export const psnTrophiesStale = `t.library_item_id IS NOT NULL AND ${current} AND t.np_communication_id IS NOT NULL AND ${defined} > 0
  AND (t.trophies_synced_count IS NULL OR t.trophies_synced_count <> ${earned})`;

export const psnCounts = `SELECT
  COALESCE(sum(CASE WHEN t.library_item_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS imported,
  COALESCE(sum(CASE WHEN ${psnReady} THEN 1 ELSE 0 END), 0) AS ready,
  COALESCE(sum(CASE WHEN ${psnUnresolved} THEN 1 ELSE 0 END), 0) AS unresolved,
  COALESCE(sum(CASE WHEN t.matched_at IS NULL AND ${current} THEN 1 ELSE 0 END), 0) AS pending,
  COALESCE(sum(CASE WHEN ${psnTrophiesStale} THEN 1 ELSE 0 END), 0) AS trophiesPending
FROM psn_titles t JOIN psn_connections c USING (connection_id) WHERE c.user_id = ?`;

export const readyPsnGames = `SELECT t.title_key AS titleKey, t.game_json AS gameJson, t.platforms_json AS platformsJson
FROM psn_titles t JOIN psn_connections c USING (connection_id)
WHERE c.connection_id = ? AND ${psnReady} ORDER BY t.last_played_at DESC, t.title_key LIMIT 30`;

// Two requests per list, so three lists per batch keeps well under Sony's per-account rate limit.
export const stalePsnTrophies = `SELECT t.id, t.np_communication_id AS npCommunicationId, t.np_service_name AS npServiceName
FROM psn_titles t JOIN psn_connections c USING (connection_id)
WHERE c.connection_id = ? AND ${psnTrophiesStale} ORDER BY t.last_played_at DESC, t.id LIMIT 3`;

export const savePsnTrophy = `
INSERT INTO psn_trophies (np_communication_id, trophy_id, group_id, name, description, icon_url, grade, is_hidden, rarity, checked_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
ON CONFLICT(np_communication_id, trophy_id) DO UPDATE SET group_id = excluded.group_id, name = excluded.name, description = excluded.description,
  icon_url = excluded.icon_url, grade = excluded.grade, is_hidden = excluded.is_hidden, rarity = COALESCE(excluded.rarity, rarity), checked_at = excluded.checked_at`;

// An earned trophy keeps its first recorded time, so rereading a list never bumps the timeline.
export const savePsnUnlock = `
INSERT INTO psn_unlocks (title_row_id, user_id, trophy_id, earned_at)
SELECT t.id, c.user_id, ?4, ?5 FROM psn_titles t JOIN psn_connections c USING (connection_id)
WHERE t.id = ?3 AND c.connection_id = ?1 AND c.lock_token = ?2 AND c.lock_until > ?6
ON CONFLICT(title_row_id, trophy_id) DO NOTHING`;

// Completion is the platinum's time; lists without a platinum complete with the final base-game trophy.
// Add-on trophy groups never count, so new DLC does not reopen a finished game.
const unlocked = `FROM psn_unlocks u JOIN psn_trophies d ON d.np_communication_id = psn_titles.np_communication_id AND d.trophy_id = u.trophy_id WHERE u.title_row_id = psn_titles.id`;
const baseDefined = `(SELECT count(*) FROM psn_trophies d WHERE d.np_communication_id = psn_titles.np_communication_id AND d.group_id = 'default')`;
export const finishPsnTrophies = `
UPDATE psn_titles SET trophies_synced_count = earned_platinum + earned_gold + earned_silver + earned_bronze,
  completed_at = CASE
    WHEN EXISTS (SELECT 1 FROM psn_trophies d WHERE d.np_communication_id = psn_titles.np_communication_id AND d.grade = 'platinum')
      THEN (SELECT min(u.earned_at) ${unlocked} AND d.grade = 'platinum')
    WHEN ${baseDefined} > 0 AND (SELECT count(*) ${unlocked} AND d.group_id = 'default') >= ${baseDefined}
      THEN (SELECT max(u.earned_at) ${unlocked} AND d.group_id = 'default')
    ELSE NULL END
WHERE id = ?3 AND connection_id = ?1 AND ${leased("?1", "?2", "?4")}`;

export const psnShowcaseQuery = `SELECT t.id AS titleRowId, l.igdb_id AS igdbId, l.name, l.cover_url AS coverUrl, l.release_year AS releaseYear,
    l.platform_name AS platformName, ${earned} AS earnedTrophies, ${defined} AS totalTrophies,
    t.defined_platinum > 0 AS hasPlatinum, t.play_seconds AS playSeconds, t.last_played_at AS lastPlayedAt, t.completed_at AS completedAt
  FROM psn_connections c JOIN psn_titles t USING (connection_id) JOIN library_items l ON l.id = t.library_item_id
  WHERE c.user_id = ?1 AND ${defined} > 0
  ORDER BY t.last_played_at IS NULL, t.last_played_at DESC, t.id DESC LIMIT ?2`;

// The level and grade counts are Sony's account-wide totals; games and completions count added games only.
export const psnShowcaseTotals = `SELECT c.trophy_level AS level, c.earned_platinum AS platinum, c.earned_gold AS gold, c.earned_silver AS silver, c.earned_bronze AS bronze,
    (SELECT count(*) FROM psn_titles t WHERE t.connection_id = c.connection_id AND t.library_item_id IS NOT NULL AND ${defined} > 0) AS games,
    (SELECT count(*) FROM psn_titles t WHERE t.connection_id = c.connection_id AND t.library_item_id IS NOT NULL AND t.completed_at IS NOT NULL) AS completed
  FROM psn_connections c WHERE c.user_id = ?1`;

// Unearned hidden trophies stay hidden; earned first, newest first, then Sony's own order.
export const psnTrophyListQuery = `SELECT d.trophy_id AS id, d.group_id AS groupId,
    CASE WHEN d.is_hidden AND u.earned_at IS NULL THEN 'Hidden trophy' ELSE d.name END AS name,
    CASE WHEN d.is_hidden AND u.earned_at IS NULL THEN NULL ELSE d.description END AS description,
    d.icon_url AS iconUrl, d.grade, d.is_hidden AS isHidden, d.rarity, u.earned_at AS earnedAt
  FROM psn_connections c JOIN psn_titles t USING (connection_id)
  JOIN psn_trophies d ON d.np_communication_id = t.np_communication_id
  LEFT JOIN psn_unlocks u ON u.title_row_id = t.id AND u.trophy_id = d.trophy_id
  WHERE c.user_id = ?1 AND t.id = ?2 AND t.library_item_id IS NOT NULL
  ORDER BY u.earned_at IS NULL, u.earned_at DESC, d.trophy_id LIMIT 1000`;

const views = { all: "1", ready: psnReady, unresolved: psnUnresolved, imported: "t.library_item_id IS NOT NULL" };
export type PsnView = keyof typeof views;
export const psnViews = Object.keys(views) as PsnView[];
// Most recently played first, so the top of every view doubles as recent activity.
const pageFrom = (view: PsnView) => `FROM psn_titles t JOIN psn_connections c USING (connection_id) LEFT JOIN library_items l ON l.id = t.library_item_id
  WHERE c.user_id = ?1 AND (?2 = '' OR instr(lower(t.name), lower(?2)) > 0) AND ${views[view]}`;
export const psnPageCount = (view: PsnView) => `SELECT count(*) AS total ${pageFrom(view)}`;
export const psnPage = (view: PsnView) => `SELECT t.title_key AS titleKey, t.name, t.image_url AS imageUrl, t.platforms_json AS platformsJson,
    t.last_played_at AS lastPlayedAt, t.play_seconds AS playSeconds, ${earned} AS earnedTrophies, ${defined} AS totalTrophies,
    t.defined_platinum > 0 AS hasPlatinum, t.earned_platinum > 0 AS platinumEarned, t.game_json AS gameJson, t.matched_at AS matchedAt,
    t.imported_at AS importedAt, t.library_item_id AS libraryItemId, l.playing_since AS playingSince, t.observed_at = c.synced_at AS available
  ${pageFrom(view)} ORDER BY t.last_played_at IS NULL, t.last_played_at DESC, t.name, t.title_key LIMIT 30 OFFSET ?3`;

// Removes every library copy this connection added or linked. PlayStation never adds anything on its own, so removed games are ready to add again.
export const removePsnCopies = `
DELETE FROM library_items WHERE user_id = ?1 AND id IN (
  SELECT t.library_item_id FROM psn_titles t JOIN psn_connections c ON c.connection_id = t.connection_id
  WHERE c.connection_id = ?2 AND c.lock_token = ?3 AND t.library_item_id IS NOT NULL)`;
