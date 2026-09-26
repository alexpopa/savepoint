export const popularGamesQuery = `
  WITH popular AS (
    SELECT igdb_id, COUNT(DISTINCT user_id) AS player_count, MAX(added_at) AS last_added_at
    FROM library_items
    WHERE added_at BETWEEN ? AND ?
    GROUP BY igdb_id
    ORDER BY player_count DESC, last_added_at DESC, igdb_id ASC
    LIMIT 5
  )
  SELECT popular.igdb_id AS igdbId,
    popular.player_count AS playerCount,
    game.name,
    game.cover_url AS coverUrl,
    game.release_year AS releaseYear,
    game.platforms_json AS platformsJson
  FROM popular
  JOIN library_items AS game ON game.id = (
    SELECT latest.id
    FROM library_items AS latest
    WHERE latest.igdb_id = popular.igdb_id
    ORDER BY latest.added_at DESC, latest.id DESC
    LIMIT 1
  )
  ORDER BY popular.player_count DESC, popular.last_added_at DESC, popular.igdb_id ASC
`;
