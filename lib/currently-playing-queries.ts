// Marking again keeps the original time, so repeating a request never bumps the timeline entry.
export const startPlaying = `UPDATE library_items SET playing_since = COALESCE(playing_since, ?3)
  WHERE id = ?1 AND user_id = ?2`;

export const stopPlaying = "UPDATE library_items SET playing_since = NULL WHERE id = ?1 AND user_id = ?2";
