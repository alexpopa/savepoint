// Event reads and writes that run as raw SQL, tested against the real migrations in tests/events.test.ts.

// Every source game on every connected service with its running playtime total. Keys stay stable across refreshes,
// so the baseline can include games that are not matched or added to the library yet.
export const eventPlaytimeSources = `
SELECT 'steam:' || g.app_id AS key, g.playtime_minutes AS minutes, g.last_played_at AS lastPlayedAt, g.library_item_id AS libraryItemId
  FROM steam_games g JOIN steam_connections c USING (connection_id) WHERE c.user_id = ?1
UNION ALL SELECT 'xbox:' || t.title_id, t.play_minutes, t.last_played_at, t.library_item_id
  FROM xbox_titles t JOIN xbox_connections c USING (connection_id) WHERE c.user_id = ?1
UNION ALL SELECT 'psn:' || p.title_key, p.play_seconds / 60, p.last_played_at, p.library_item_id
  FROM psn_titles p JOIN psn_connections c USING (connection_id) WHERE c.user_id = ?1
UNION ALL SELECT 'ra:' || r.game_id, r.play_seconds / 60, r.last_played_at, r.library_item_id
  FROM ra_games r JOIN ra_connections c USING (connection_id) WHERE c.user_id = ?1`;

// Dated completions of a player's library copies inside the event (?2 start inclusive, ?3 end exclusive).
// Beaten: the library's completed mark or RetroAchievements beaten. Completed (100%): every Xbox achievement,
// the platinum or every PlayStation trophy, or every RetroAchievements achievement, at its final unlock.
export const eventCompletions = `SELECT libraryItemId, stage, at FROM (
  SELECT l.id AS libraryItemId, 'beaten' AS stage, l.completed_at AS at FROM library_items l WHERE l.user_id = ?1
  UNION ALL SELECT r.library_item_id, 'beaten', r.completed_at FROM ra_games r JOIN ra_connections c USING (connection_id) WHERE c.user_id = ?1
  UNION ALL SELECT r.library_item_id, 'completed', (SELECT max(u.earned_at) FROM ra_unlocks u WHERE u.game_row_id = r.id)
    FROM ra_games r JOIN ra_connections c USING (connection_id) WHERE c.user_id = ?1 AND r.total > 0 AND r.earned >= r.total
  UNION ALL SELECT t.library_item_id, 'completed', t.completed_at FROM xbox_titles t JOIN xbox_connections c USING (connection_id) WHERE c.user_id = ?1
  UNION ALL SELECT p.library_item_id, 'completed', p.completed_at FROM psn_titles p JOIN psn_connections c USING (connection_id) WHERE c.user_id = ?1
) WHERE libraryItemId IS NOT NULL AND at >= ?2 AND at < ?3`;

// Achievements and trophies earned inside the event, per library copy.
export const eventAchievements = `SELECT libraryItemId, sum(earned) AS earned FROM (
  SELECT t.library_item_id AS libraryItemId, count(*) AS earned FROM xbox_unlocks u JOIN xbox_titles t ON t.id = u.title_row_id
    WHERE u.user_id = ?1 AND u.unlocked_at >= ?2 AND u.unlocked_at < ?3 GROUP BY t.library_item_id
  UNION ALL SELECT p.library_item_id, count(*) FROM psn_unlocks u JOIN psn_titles p ON p.id = u.title_row_id
    WHERE u.user_id = ?1 AND u.earned_at >= ?2 AND u.earned_at < ?3 GROUP BY p.library_item_id
  UNION ALL SELECT r.library_item_id, count(*) FROM ra_unlocks u JOIN ra_games r ON r.id = u.game_row_id
    WHERE u.user_id = ?1 AND u.earned_at >= ?2 AND u.earned_at < ?3 GROUP BY r.library_item_id
) WHERE libraryItemId IS NOT NULL GROUP BY libraryItemId`;

// Updates only touch automatic values, so a player's or host's edits and removals survive every update.
export const saveEventGame = `
INSERT INTO event_games (event_id, user_id, library_item_id, igdb_id, platform_id, platform_name, name, cover_url, auto_minutes, auto_beaten_at, auto_completed_at, achievements, added_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
ON CONFLICT(event_id, user_id, igdb_id, platform_id) DO UPDATE SET library_item_id = excluded.library_item_id, platform_name = excluded.platform_name,
  name = excluded.name, cover_url = excluded.cover_url, auto_minutes = excluded.auto_minutes, auto_beaten_at = excluded.auto_beaten_at,
  auto_completed_at = excluded.auto_completed_at, achievements = excluded.achievements`;

// Adding a game by hand restores one the player removed; its values stay as they were.
export const addEventGame = `
INSERT INTO event_games (event_id, user_id, library_item_id, igdb_id, platform_id, platform_name, name, cover_url, added_at)
SELECT ?1, l.user_id, l.id, l.igdb_id, l.platform_id, l.platform_name, l.name, l.cover_url, ?4 FROM library_items l WHERE l.id = ?3 AND l.user_id = ?2
ON CONFLICT(event_id, user_id, igdb_id, platform_id) DO UPDATE SET removed = 0`;

// The baseline is taken once: the first visit after the start, by a joined player.
export const saveEventBaseline = `UPDATE event_members SET baseline_at = ?3, baseline_json = ?4, updated_at = ?3
WHERE event_id = ?1 AND user_id = ?2 AND status = 'joined' AND baseline_at IS NULL`;

// Public events take anyone, and hosts (?4 = 1) join their own private events; other players need an invitation.
// Rejoining keeps the player's data.
export const joinEvent = `
INSERT INTO event_members (event_id, user_id, status, joined_at)
SELECT id, ?2, 'joined', ?3 FROM events WHERE id = ?1 AND (visibility = 'public' OR ?4 = 1) AND ends_at > ?3
ON CONFLICT(event_id, user_id) DO UPDATE SET status = 'joined', joined_at = COALESCE(joined_at, excluded.joined_at)
  WHERE status <> 'joined'`;
export const acceptEventInvite = `UPDATE event_members SET status = 'joined', joined_at = COALESCE(joined_at, ?3)
WHERE event_id = ?1 AND user_id = ?2 AND status IN ('invited', 'left')
  AND (status = 'invited' OR joined_at IS NOT NULL) AND EXISTS (SELECT 1 FROM events WHERE id = ?1 AND ends_at > ?3)`;

// An invitation never downgrades a player who already joined.
export const inviteToEvent = `
INSERT INTO event_members (event_id, user_id, status, invited_by, invited_at) VALUES (?1, ?2, 'invited', ?3, ?4)
ON CONFLICT(event_id, user_id) DO UPDATE SET invited_by = excluded.invited_by, invited_at = excluded.invited_at,
  status = CASE WHEN status = 'joined' THEN 'joined' WHEN joined_at IS NULL THEN 'invited' ELSE status END`;

// Events a player can see: public ones, ones they are in or host, or every event for site admins (?2 = 1).
export const visibleEventsQuery = `SELECT e.id, e.name, e.description, e.visibility, e.start_day AS startDay, e.end_day AS endDay, e.time_zone AS timeZone,
    e.starts_at AS startsAt, e.ends_at AS endsAt, m.status AS memberStatus, (e.owner_id = ?1 OR h.user_id IS NOT NULL) AS hosting,
    (SELECT count(*) FROM event_members j WHERE j.event_id = e.id AND j.status = 'joined') AS players
  FROM events e LEFT JOIN event_members m ON m.event_id = e.id AND m.user_id = ?1 LEFT JOIN event_hosts h ON h.event_id = e.id AND h.user_id = ?1
  WHERE e.visibility = 'public' OR m.user_id IS NOT NULL OR e.owner_id = ?1 OR h.user_id IS NOT NULL OR ?2 = 1
  ORDER BY e.starts_at DESC, e.id DESC LIMIT 200`;

// Copying keeps the setup: description, rules, visibility, dates, and multipliers. Players, hosts, and results stay behind.
export const copyEvent = `
INSERT INTO events (owner_id, name, description, rules, visibility, start_day, end_day, time_zone, starts_at, ends_at, hour_points, beaten_points, completed_points, created_at)
SELECT ?2, substr(name || ' (copy)', 1, 80), description, rules, visibility, start_day, end_day, time_zone, starts_at, ends_at, hour_points, beaten_points, completed_points, ?3
FROM events WHERE id = ?1 RETURNING id`;
export const copyEventMultipliers = `
INSERT INTO event_multipliers (event_id, kind, target_id, name, cover_url, hour_points, beaten_points, completed_points)
SELECT ?2, kind, target_id, name, cover_url, hour_points, beaten_points, completed_points FROM event_multipliers WHERE event_id = ?1`;
