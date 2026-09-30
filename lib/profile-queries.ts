// A game counts once however many platform copies a player owns.
export const libraryStatsQuery = `SELECT COUNT(DISTINCT igdb_id) AS games,
    COUNT(DISTINCT CASE WHEN completed_at IS NOT NULL THEN igdb_id END) AS completed
  FROM library_items WHERE user_id = ?1`;

export const profileAccountQuery = `SELECT is_public AS isPublic,
    password_hash IS NOT NULL AND email_verified_at IS NOT NULL AS verified
  FROM accounts WHERE user_id = ?1`;
