export const honorLimit = 6;

const honored = `recipient_id = ?1 AND is_favorite = 1 AND declined_at IS NULL`;

// The count and update run as one statement, so concurrent stars cannot overfill the Hall of Honor.
// Only completed challenges qualify, and a new honor takes the last place.
export const awardHonor = `UPDATE challenges SET is_favorite = 1,
  sort_order = (SELECT COALESCE(MIN(sort_order), 0) - 1 FROM challenges WHERE ${honored})
WHERE id = ?2 AND recipient_id = ?1 AND is_favorite = 0 AND declined_at IS NULL
  AND creator_confirmed = 1 AND recipient_confirmed = 1
  AND (SELECT COUNT(*) FROM challenges WHERE ${honored}) < ${honorLimit}`;

// Like the Top 10: materialize positions, move one honor to ?3 (clamped), and shift the ones
// between by one place. Renumbering also untangles legacy rows that share a sort_order.
// Honors sort by sort_order descending, so position n is stored as -n.
export const placeHonor = `WITH ordered AS MATERIALIZED (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order DESC, id DESC) AS position
  FROM challenges WHERE ${honored} AND creator_confirmed = 1 AND recipient_confirmed = 1
), target AS MATERIALIZED (
  SELECT position AS current, MIN(MAX(?3, 1), (SELECT COUNT(*) FROM ordered)) AS destination
  FROM ordered WHERE id = ?2
)
UPDATE challenges SET sort_order = -(
  SELECT CASE
    WHEN position = target.current THEN target.destination
    WHEN target.current < target.destination AND position > target.current AND position <= target.destination THEN position - 1
    WHEN target.current > target.destination AND position >= target.destination AND position < target.current THEN position + 1
    ELSE position END
  FROM ordered, target WHERE ordered.id = challenges.id
)
WHERE id IN (SELECT id FROM ordered) AND EXISTS (SELECT 1 FROM target)`;

export type ChallengeRow = {
  id: number;
  recipientId: string;
  creatorId: string;
  igdbId: number;
  gameName: string;
  gameCoverUrl: string | null;
  title: string;
  description: string;
  createdAt: number;
  creatorConfirmed: number;
  recipientConfirmed: number;
  declined: number;
  isFavorite: number;
  sortOrder: number;
  creatorDisplayName: string | null;
  creatorEmail: string | null;
  recipientDisplayName: string | null;
  recipientEmail: string | null;
};

// Both players and the current cover arrive with each challenge in one statement. The cover
// comes from the newest library copy that has one, since challenge rows can predate a recovered
// cover; the challenge's own snapshot is the fallback. The lookup stops at the first match.
const challengeList = `SELECT c.id, c.recipient_id AS recipientId, c.creator_id AS creatorId, c.igdb_id AS igdbId, c.game_name AS gameName,
    COALESCE((SELECT copy.cover_url FROM library_items AS copy
      WHERE copy.igdb_id = c.igdb_id AND copy.cover_url <> '' ORDER BY copy.added_at DESC LIMIT 1), c.game_cover_url) AS gameCoverUrl,
    c.title, c.description, c.created_at AS createdAt,
    c.creator_confirmed AS creatorConfirmed, c.recipient_confirmed AS recipientConfirmed,
    c.declined_at IS NOT NULL AS declined, c.is_favorite AS isFavorite, c.sort_order AS sortOrder,
    creator.display_name AS creatorDisplayName, creator.email AS creatorEmail,
    recipient.display_name AS recipientDisplayName, recipient.email AS recipientEmail
  FROM challenges AS c
  LEFT JOIN accounts AS creator ON creator.user_id = c.creator_id
  LEFT JOIN accounts AS recipient ON recipient.user_id = c.recipient_id`;

// Declined challenges leave the recipient's lists but stay in the creator's log.
export const receivedChallengesQuery = `${challengeList}
  WHERE c.recipient_id = ?1 AND c.declined_at IS NULL ORDER BY c.id DESC`;

export const sentChallengesQuery = `${challengeList}
  WHERE c.creator_id = ?1 ORDER BY c.id DESC`;
