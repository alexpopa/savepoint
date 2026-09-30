// Marking again keeps the original time, so repeating a request never bumps the timeline entry.
export const markCompleted = `UPDATE library_items SET completed_at = COALESCE(completed_at, ?3)
  WHERE id = ?1 AND user_id = ?2`;

export const clearCompleted = "UPDATE library_items SET completed_at = NULL WHERE id = ?1 AND user_id = ?2";
