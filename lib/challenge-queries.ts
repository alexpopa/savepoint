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
