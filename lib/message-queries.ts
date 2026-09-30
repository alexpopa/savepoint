// Direct messages between accepted friends. Parameter ?1 is always the viewer's account ID.
// Messages are personal: admins need a friendship too, because a message from a non-friend would reveal the role.

export const messagePageSize = 30;
export const messageLengthLimit = 2000;
const previewLength = 140;

const verified = (account: string) => `${account}.password_hash IS NOT NULL AND ${account}.email_verified_at IS NOT NULL`;
const friendIds = `(SELECT user_high FROM friendships WHERE user_low = ?1 AND status = 'accepted'
  UNION ALL SELECT user_low FROM friendships WHERE user_high = ?1 AND status = 'accepted')`;
const pair = (other: string) => `user_low = min(?1, ${other}) AND user_high = max(?1, ${other})`;

export type ConversationRow = {
  userId: string; displayName: string; email: string;
  lastId: number | null; lastBody: string | null; lastMine: number | null; lastAt: number | null; unread: number;
};
export type MessageRow = { id: number; mine: number; body: string; createdAt: number };

// Every verified accepted friend with the latest message preview and their unread count; recent conversations
// first, then friends without messages by name. Each friend costs two index seeks.
export const conversationsQuery = `SELECT friend.user_id AS userId, friend.display_name AS displayName, friend.email AS email,
    last.id AS lastId, substr(last.body, 1, ${previewLength}) AS lastBody, last.sender_id = ?1 AS lastMine, last.created_at AS lastAt,
    (SELECT COUNT(*) FROM messages WHERE recipient_id = ?1 AND sender_id = friend.user_id AND read_at IS NULL) AS unread
  FROM accounts AS friend
  LEFT JOIN messages AS last ON last.id = (SELECT id FROM messages WHERE ${pair("friend.user_id")} ORDER BY id DESC LIMIT 1)
  WHERE friend.user_id IN ${friendIds} AND ${verified("friend")}
  ORDER BY last.id IS NULL, last.created_at DESC, last.id DESC, lower(friend.display_name), friend.user_id`;

// Only current friends count, so the badge never points at a conversation the list no longer shows.
export const unreadCountQuery = `SELECT COUNT(*) AS count FROM messages AS message
  JOIN accounts AS sender ON sender.user_id = message.sender_id
  WHERE message.recipient_id = ?1 AND message.read_at IS NULL AND message.sender_id IN ${friendIds} AND ${verified("sender")}`;

// ?2 friend ID. Returns the friend only while the friendship is accepted and both accounts are verified.
export const messageFriendQuery = `SELECT friend.user_id AS userId, friend.display_name AS displayName, friend.email AS email
  FROM accounts AS friend
  JOIN accounts AS viewer ON viewer.user_id = ?1 AND ${verified("viewer")}
  JOIN friendships ON friendships.${pair("friend.user_id")} AND friendships.status = 'accepted'
  WHERE friend.user_id = ?2 AND friend.user_id <> ?1 AND ${verified("friend")}`;

// ?2 friend ID, ?3 exclusive cursor, ?4 limit. Older pages come newest first; the client reverses them.
export const olderMessagesQuery = `SELECT id, sender_id = ?1 AS mine, body, created_at AS createdAt FROM messages
  WHERE ${pair("?2")} AND id < ?3 ORDER BY id DESC LIMIT ?4`;
export const newerMessagesQuery = `SELECT id, sender_id = ?1 AS mine, body, created_at AS createdAt FROM messages
  WHERE ${pair("?2")} AND id > ?3 ORDER BY id LIMIT ?4`;

// ?2 recipient ID, ?3 body, ?4 time. Inserts nothing unless the two are verified accepted friends at this moment.
export const sendMessageQuery = `INSERT INTO messages (user_low, user_high, sender_id, recipient_id, body, created_at)
  SELECT min(?1, ?2), max(?1, ?2), ?1, ?2, ?3, ?4
  WHERE EXISTS (${messageFriendQuery})
  RETURNING id, 1 AS mine, body, created_at AS createdAt`;

// ?2 friend ID, ?3 time, ?4 newest message ID the viewer has loaded, so unseen later messages stay unread.
export const markReadQuery = `UPDATE messages SET read_at = ?3
  WHERE recipient_id = ?1 AND sender_id = ?2 AND read_at IS NULL AND id <= ?4
    AND EXISTS (${messageFriendQuery})`;
