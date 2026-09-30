// Friends timeline reads, sent together in one D1 batch. Parameters: ?1 viewer ID, ?2 newest time to read
// (the cursor, inclusive), ?3 JSON floors {userId: time}, ?4 row limit, and, for challenges only,
// ?5 1 when the viewer may see private non-friend participants (admins).

// Start from the viewer's accepted friends so each read uses a per-friend index instead of scanning everyone's activity.
const friendIds = `(SELECT user_high FROM friendships WHERE user_low = ?1 AND status = 'accepted'
  UNION ALL SELECT user_low FROM friendships WHERE user_high = ?1 AND status = 'accepted')`;
const verified = (account: string) => `${account}.password_hash IS NOT NULL AND ${account}.email_verified_at IS NOT NULL`;
const person = (account: string, prefix = "") => {
  const alias = (name: string) => prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
  return `${account}.user_id AS ${alias("userId")}, ${account}.display_name AS ${alias("displayName")}, ${account}.email AS ${alias("email")}`;
};
// Rows at or after a friend's floor already belong to a batch an earlier page showed.
const belowFloor = (at: string) => `NOT EXISTS (SELECT 1 FROM json_each(?3) AS floor WHERE floor.key = row.user_id AND ${at} >= floor.value)`;

export type TimelinePersonRow = { userId: string; displayName: string; email: string };
export type TimelineCopyRow = TimelinePersonRow & { id: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null; at: number };
export type TimelineFavoriteRow = TimelinePersonRow & { id: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; at: number };
export type TimelineRatingRow = TimelineFavoriteRow & { score: number };
export type TimelineChallengeRow = {
  id: number; at: number; createdAt: number; title: string; description: string; gameName: string; coverUrl: string | null;
  creatorConfirmed: number; recipientConfirmed: number;
  creatorUserId: string; creatorDisplayName: string; creatorEmail: string;
  recipientUserId: string; recipientDisplayName: string; recipientEmail: string;
};

const copies = (at: string, floor = false) => `SELECT row.id, row.igdb_id AS igdbId, row.name, row.cover_url AS coverUrl, row.release_year AS releaseYear,
    row.platform_name AS platformName, row.${at} AS at, ${person("account")}
  FROM library_items AS row JOIN accounts AS account ON account.user_id = row.user_id
  WHERE row.user_id IN ${friendIds} AND row.${at} IS NOT NULL AND row.${at} <= ?2${floor ? ` AND ${belowFloor(`row.${at}`)}` : ""} AND ${verified("account")}
  ORDER BY row.${at} DESC, row.id DESC LIMIT ?4`;

export const timelineLibraryQuery = copies("added_at", true);
export const timelinePlayingQuery = copies("playing_since");
export const timelineCompletedQuery = copies("completed_at");

export const timelineFavoritesQuery = `SELECT row.id, row.igdb_id AS igdbId, row.name, row.cover_url AS coverUrl, row.release_year AS releaseYear,
    row.favorited_at AS at, ${person("account")}
  FROM game_favorites AS row JOIN accounts AS account ON account.user_id = row.user_id
  WHERE row.user_id IN ${friendIds} AND row.favorited_at <= ?2 AND ${verified("account")}
  ORDER BY row.favorited_at DESC, row.id DESC LIMIT ?4`;

export const timelineRatingsQuery = `SELECT row.id, row.igdb_id AS igdbId, row.name, row.cover_url AS coverUrl, row.release_year AS releaseYear,
    row.score, row.rated_at AS at, ${person("account")}
  FROM game_ratings AS row JOIN accounts AS account ON account.user_id = row.user_id
  WHERE row.user_id IN ${friendIds} AND row.rated_at <= ?2 AND ${belowFloor("row.rated_at")} AND ${verified("account")}
  ORDER BY row.rated_at DESC, row.id DESC LIMIT ?4`;

// A private participant who is not the viewer or a friend hides the whole challenge, unless ?5 allows it.
const visible = (account: string) => `(?5 OR ${account}.user_id = ?1 OR ${account}.is_public
  OR EXISTS (SELECT 1 FROM friendships WHERE status = 'accepted'
    AND ((user_low = ?1 AND user_high = ${account}.user_id) OR (user_high = ?1 AND user_low = ${account}.user_id))))`;
export const timelineChallengesQuery = `SELECT row.id, row.timeline_at AS at, row.created_at AS createdAt, row.title, row.description,
    row.game_name AS gameName, row.game_cover_url AS coverUrl,
    row.creator_confirmed AS creatorConfirmed, row.recipient_confirmed AS recipientConfirmed,
    ${person("creator", "creator")}, ${person("recipient", "recipient")}
  FROM challenges AS row
  JOIN accounts AS creator ON creator.user_id = row.creator_id
  JOIN accounts AS recipient ON recipient.user_id = row.recipient_id
  WHERE (row.creator_id IN ${friendIds} OR row.recipient_id IN ${friendIds})
    AND row.timeline_at IS NOT NULL AND row.timeline_at <= ?2 AND row.declined_at IS NULL
    AND ${visible("creator")} AND ${visible("recipient")} AND ${verified("creator")} AND ${verified("recipient")}
  ORDER BY row.timeline_at DESC, row.id DESC LIMIT ?4`;

// Save artwork recovered from IGDB so a legacy row is looked up once, not on every page load.
export const saveRecoveredCoverQuery = `UPDATE library_items SET cover_url = ?2 WHERE id = ?1 AND (cover_url IS NULL OR cover_url = '')`;
