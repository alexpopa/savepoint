// Marking again keeps the original time, so repeating a request never bumps the timeline entry.
export const startPlaying = `UPDATE library_items SET playing_since = COALESCE(playing_since, ?3)
  WHERE id = ?1 AND user_id = ?2`;

export const stopPlaying = "UPDATE library_items SET playing_since = NULL WHERE id = ?1 AND user_id = ?2";

export const currentlyPlayingQuery = `SELECT id, igdb_id AS igdbId, name, cover_url AS coverUrl, release_year AS releaseYear,
    platform_name AS platformName, playing_since AS playingSince, completed_at AS completedAt
  FROM library_items WHERE user_id = ?1 AND playing_since IS NOT NULL ORDER BY playing_since DESC, id DESC`;
