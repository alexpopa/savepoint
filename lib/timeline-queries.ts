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

export type TimelineUnlockRow = TimelinePersonRow & { id: number; titleRowId: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null;
  achievementName: string; iconUrl: string | null; gamerscore: number; at: number };
export type TimelineMasteredRow = TimelineCopyRow & { titleRowId: number; totalAchievements: number; totalGamerscore: number };

// Xbox entries cover only games the friend added to their library, and disappear with that copy.
const xboxGame = `l.igdb_id AS igdbId, l.name, l.cover_url AS coverUrl, l.release_year AS releaseYear, l.platform_name AS platformName`;
// Unlocks batch per friend and game, so floors are keyed by both (see achievementGroup).
export const timelineAchievementsQuery = `SELECT row.id, row.unlocked_at AS at, t.id AS titleRowId, ${xboxGame},
    COALESCE(a.name, 'Achievement') AS achievementName, a.icon_url AS iconUrl, COALESCE(a.gamerscore, 0) AS gamerscore, ${person("account")}
  FROM xbox_unlocks AS row JOIN xbox_titles AS t ON t.id = row.title_row_id JOIN library_items AS l ON l.id = t.library_item_id
  JOIN accounts AS account ON account.user_id = row.user_id
  LEFT JOIN xbox_achievements AS a ON a.title_id = t.title_id AND a.achievement_id = row.achievement_id
  WHERE row.user_id IN ${friendIds} AND row.unlocked_at <= ?2 AND ${verified("account")}
    AND NOT EXISTS (SELECT 1 FROM json_each(?3) AS floor WHERE floor.key = row.user_id || ':' || t.id AND row.unlocked_at >= floor.value)
  ORDER BY row.unlocked_at DESC, row.id DESC LIMIT ?4`;

// Every achievement earned; a later add-on with new achievements hides the entry until those are earned too.
export const timelineMasteredQuery = `SELECT t.id, t.id AS titleRowId, t.completed_at AS at, ${xboxGame},
    t.total_achievements AS totalAchievements, t.total_gamerscore AS totalGamerscore, ${person("account")}
  FROM xbox_connections AS row JOIN xbox_titles AS t ON t.connection_id = row.connection_id JOIN library_items AS l ON l.id = t.library_item_id
  JOIN accounts AS account ON account.user_id = row.user_id
  WHERE row.user_id IN ${friendIds} AND t.completed_at IS NOT NULL AND t.completed_at <= ?2 AND t.current_achievements = t.total_achievements AND ${verified("account")}
  ORDER BY t.completed_at DESC, t.id DESC LIMIT ?4`;

export type TimelineTrophyRow = TimelinePersonRow & { id: number; titleRowId: number; igdbId: number; name: string; coverUrl: string | null; releaseYear: number | null; platformName: string | null;
  trophyName: string; grade: string; at: number };
export type TimelinePlatinumRow = TimelineCopyRow & { titleRowId: number; hasPlatinum: number; totalTrophies: number };

// PlayStation entries follow the Xbox rules: added games only, gone with the copy, unlocks batched per friend and game.
export const timelineTrophiesQuery = `SELECT row.id, row.earned_at AS at, t.id AS titleRowId, ${xboxGame},
    COALESCE(d.name, 'Trophy') AS trophyName, COALESCE(d.grade, 'bronze') AS grade, ${person("account")}
  FROM psn_unlocks AS row JOIN psn_titles AS t ON t.id = row.title_row_id JOIN library_items AS l ON l.id = t.library_item_id
  JOIN accounts AS account ON account.user_id = row.user_id
  LEFT JOIN psn_trophies AS d ON d.np_communication_id = t.np_communication_id AND d.trophy_id = row.trophy_id
  WHERE row.user_id IN ${friendIds} AND row.earned_at <= ?2 AND ${verified("account")}
    AND NOT EXISTS (SELECT 1 FROM json_each(?3) AS floor WHERE floor.key = row.user_id || ':' || t.id AND row.earned_at >= floor.value)
  ORDER BY row.earned_at DESC, row.id DESC LIMIT ?4`;

// The platinum, or every base-game trophy for lists without one.
export const timelinePlatinumQuery = `SELECT t.id, t.id AS titleRowId, t.completed_at AS at, ${xboxGame}, t.defined_platinum > 0 AS hasPlatinum,
    t.defined_platinum + t.defined_gold + t.defined_silver + t.defined_bronze AS totalTrophies, ${person("account")}
  FROM psn_connections AS row JOIN psn_titles AS t ON t.connection_id = row.connection_id JOIN library_items AS l ON l.id = t.library_item_id
  JOIN accounts AS account ON account.user_id = row.user_id
  WHERE row.user_id IN ${friendIds} AND t.completed_at IS NOT NULL AND t.completed_at <= ?2 AND ${verified("account")}
  ORDER BY t.completed_at DESC, t.id DESC LIMIT ?4`;

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
