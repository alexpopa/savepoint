export const favoriteLimit = 10;

// The count and insert run as one statement, so concurrent requests cannot exceed the limit.
export const insertGameFavorite = `INSERT INTO game_favorites
  (user_id, igdb_id, name, cover_url, release_year, favorited_at, sort_order)
  SELECT ?1, ?2, ?3, ?4, ?5, ?6, COALESCE(MAX(sort_order), -1) + 1
  FROM game_favorites WHERE user_id = ?1
  HAVING COUNT(*) < ${favoriteLimit}
  ON CONFLICT(user_id, igdb_id) DO NOTHING`;

// Materialize positions before updating so the shift resolves against current database
// state, including gaps after deletion; ordering never changes the activity timestamp.
// The destination is clamped to the shelf, and the favorites in between shift one place.
export const placeGameFavorite = `WITH ordered AS MATERIALIZED (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) AS position
  FROM game_favorites WHERE user_id = ?1
), target AS MATERIALIZED (
  SELECT position AS current, MIN(MAX(?3, 1), (SELECT COUNT(*) FROM ordered)) AS destination
  FROM ordered WHERE id = ?2
)
UPDATE game_favorites SET sort_order = (
  SELECT CASE
    WHEN position = target.current THEN target.destination
    WHEN target.current < target.destination AND position > target.current AND position <= target.destination THEN position - 1
    WHEN target.current > target.destination AND position >= target.destination AND position < target.current THEN position + 1
    ELSE position END
  FROM ordered, target WHERE ordered.id = game_favorites.id
)
WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM target)`;

export const gameFavoritesQuery = `SELECT id, igdb_id AS igdbId, name, cover_url AS coverUrl, release_year AS releaseYear,
    favorited_at AS favoritedAt, sort_order AS sortOrder
  FROM game_favorites WHERE user_id = ?1 ORDER BY sort_order, id`;
