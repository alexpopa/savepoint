// Changing a score keeps the first rating time, so editing never bumps the timeline entry.
export const rescoreGameRating = "UPDATE game_ratings SET score = ?3 WHERE user_id = ?1 AND igdb_id = ?2";

export const insertGameRating = `INSERT INTO game_ratings
  (user_id, igdb_id, name, cover_url, release_year, score, rated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  ON CONFLICT(user_id, igdb_id) DO UPDATE SET score = excluded.score`;
