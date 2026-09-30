// Aggregate counts only: the admin portal never lists another player's email or role.
// ?1 starts the recent-activity window and ?2 is the current time, both in Unix milliseconds.
export const siteStatsQuery = `SELECT
    (SELECT COUNT(*) FROM accounts WHERE password_hash IS NOT NULL AND email_verified_at IS NOT NULL) AS players,
    (SELECT COUNT(*) FROM accounts WHERE password_hash IS NOT NULL AND email_verified_at IS NOT NULL AND is_public = 1) AS publicPlayers,
    (SELECT COUNT(*) FROM accounts WHERE password_hash IS NOT NULL AND email_verified_at IS NULL) AS unverified,
    (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE expires_at > ?2) AS signedIn,
    (SELECT COUNT(DISTINCT igdb_id) FROM library_items) AS games,
    (SELECT COUNT(*) FROM library_items) AS copies,
    (SELECT COUNT(*) FROM library_items WHERE playing_since IS NOT NULL) AS playing,
    (SELECT COUNT(*) FROM library_items WHERE completed_at IS NOT NULL) AS completed,
    (SELECT COUNT(*) FROM game_favorites) AS favorites,
    (SELECT COUNT(*) FROM game_ratings) AS ratings,
    (SELECT COUNT(*) FROM challenges) AS challenges,
    (SELECT COUNT(*) FROM challenges WHERE creator_confirmed = 1 AND recipient_confirmed = 1) AS clearedChallenges,
    (SELECT COUNT(*) FROM friendships WHERE status = 'accepted') AS friendships,
    (SELECT COUNT(*) FROM friendships WHERE status = 'pending') AS pendingRequests,
    (SELECT COUNT(*) FROM library_items WHERE added_at >= ?1) AS recentCopies,
    (SELECT COUNT(*) FROM challenges WHERE created_at >= ?1) AS recentChallenges,
    (SELECT COUNT(*) FROM game_ratings WHERE rated_at >= ?1) AS recentRatings,
    (SELECT COUNT(*) FROM friendships WHERE created_at >= ?1) AS recentFriendships`;

export type SiteStats = Record<"players" | "publicPlayers" | "unverified" | "signedIn" | "games" | "copies" | "playing" | "completed" | "favorites" | "ratings"
  | "challenges" | "clearedChallenges" | "friendships" | "pendingRequests" | "recentCopies" | "recentChallenges" | "recentRatings" | "recentFriendships", number>;
