// The count and insert run as one statement, so concurrent requests cannot exceed nine.
export const insertGameFavorite = `INSERT INTO game_favorites
  (user_id, igdb_id, name, cover_url, release_year, favorited_at, sort_order)
  SELECT ?1, ?2, ?3, ?4, ?5, ?6, COALESCE(MAX(sort_order), -1) + 1
  FROM game_favorites WHERE user_id = ?1
  HAVING COUNT(*) < 9
  ON CONFLICT(user_id, igdb_id) DO NOTHING`;

// Materialize positions before updating. Resolve neighbors against current database
// state, including gaps after deletion; ordering never changes the activity timestamp.
export const moveGameFavorite = `WITH ordered AS MATERIALIZED (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) AS position
  FROM game_favorites WHERE user_id = ?1
), target AS MATERIALIZED (
  SELECT position AS current, position + ?3 AS destination FROM ordered WHERE id = ?2
)
UPDATE game_favorites SET sort_order = (
  SELECT CASE
    WHEN position = target.current THEN target.destination
    WHEN position = target.destination THEN target.current
    ELSE position END
  FROM ordered, target WHERE ordered.id = game_favorites.id
)
WHERE user_id = ?1 AND EXISTS (
  SELECT 1 FROM ordered, target WHERE ordered.position = target.destination
)`;
