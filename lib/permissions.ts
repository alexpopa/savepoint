export type PermissionUser = { userId: string; isAdmin: boolean };
export type ConfirmationParticipant = "creator" | "recipient";

// All application permission checks must preserve this admin override.
// Authentication, request validation, and data integrity still apply.
export function hasPermission(user: PermissionUser | null, ordinarilyAllowed: boolean): boolean {
  return user !== null && (user.isAdmin || ordinarilyAllowed);
}

export function canViewProfile(user: PermissionUser | null, account: { userId: string; isPublic: boolean }, friendshipStatus?: string): boolean {
  return hasPermission(user, account.userId === user?.userId || account.isPublic || friendshipStatus === "accepted");
}

export function confirmationParticipant(user: PermissionUser, challenge: { recipientId: string; creatorId: string }, requested?: unknown): ConfirmationParticipant | null {
  if (requested !== undefined && requested !== "creator" && requested !== "recipient") return null;
  const participant = requested ?? (challenge.creatorId === user.userId ? "creator" : "recipient");
  return hasPermission(user, challenge[participant === "creator" ? "creatorId" : "recipientId"] === user.userId)
    ? participant
    : null;
}
