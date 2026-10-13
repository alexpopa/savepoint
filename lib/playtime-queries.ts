// Each service's playtime for one library copy, found through the owner's connection so the per-connection indexes apply.
const sources = (copy: string) => `
  SELECT 'Steam' AS service, g.playtime_minutes AS minutes FROM steam_games g
    WHERE g.connection_id = (SELECT connection_id FROM steam_connections WHERE user_id = ${copy}.user_id) AND g.library_item_id = ${copy}.id
  UNION ALL SELECT 'Xbox', t.play_minutes FROM xbox_titles t
    WHERE t.connection_id = (SELECT connection_id FROM xbox_connections WHERE user_id = ${copy}.user_id) AND t.library_item_id = ${copy}.id
  UNION ALL SELECT 'PlayStation', p.play_seconds / 60 FROM psn_titles p
    WHERE p.connection_id = (SELECT connection_id FROM psn_connections WHERE user_id = ${copy}.user_id) AND p.library_item_id = ${copy}.id
  UNION ALL SELECT 'RetroAchievements', r.play_seconds / 60 FROM ra_games r
    WHERE r.connection_id = (SELECT connection_id FROM ra_connections WHERE user_id = ${copy}.user_id) AND r.library_item_id = ${copy}.id`;

// Total minutes the connected services report for a copy, or null when none reports any.
export const sourceMinutes = (copy: string) => `(SELECT sum(minutes) FROM (${sources(copy)}))`;
export const sourceNames = (copy: string) => `(SELECT group_concat(service, ', ') FROM (${sources(copy)}) WHERE minutes IS NOT NULL)`;

// Saving remembers the services' current total, so that total is never offered again; null follows the services.
export const setPlaytime = `UPDATE library_items AS l SET play_minutes = ?3, play_source_minutes = CASE WHEN ?3 IS NULL THEN NULL ELSE ${sourceMinutes("l")} END
WHERE l.id = ?1 AND l.user_id = ?2`;

// Copies a service linked whose own time differs from a services' total that changed since the player set it.
const offered = (service: string, table: string) => `l.play_minutes IS NOT NULL AND ${sourceMinutes("l")} IS NOT NULL
  AND ${sourceMinutes("l")} IS NOT l.play_source_minutes AND ${sourceMinutes("l")} <> l.play_minutes
  AND l.id IN (SELECT s.library_item_id FROM ${table} s JOIN ${service}_connections c USING (connection_id) WHERE c.user_id = l.user_id)`;
const tables = { steam: "steam_games", xbox: "xbox_titles", psn: "psn_titles", ra: "ra_games" };
export type PlaytimeService = keyof typeof tables;
export const playtimeOfferCount = (service: PlaytimeService) => `SELECT count(*) AS total FROM library_items l WHERE l.user_id = ?1 AND ${offered(service, tables[service])}`;
export const acceptPlaytimeOffers = (service: PlaytimeService) => `UPDATE library_items AS l SET play_minutes = NULL, play_source_minutes = NULL
WHERE l.user_id = ?1 AND ${offered(service, tables[service])}`;

// Provider lifetime totals stand alone; only games without a reported total add manual event hours.
// Match by player/game/platform so removing and re-adding a library copy keeps its independently saved event hours.
export const manualEventMinutes = (copy: string) => `(CASE WHEN ${sourceMinutes(copy)} IS NOT NULL THEN 0 ELSE (SELECT COALESCE(sum(max(0, e.adjust_minutes)), 0) FROM event_games e
  WHERE e.user_id = ${copy}.user_id AND e.igdb_id = ${copy}.igdb_id AND e.platform_id = ${copy}.platform_id AND e.removed = 0) END)`;
