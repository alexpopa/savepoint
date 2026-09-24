export function profilePath(account: { userId: string; displayName: string; email: string }): string {
  // Older accounts can use their email as the stored name. Keep those on the
  // original opaque URL so a public profile link does not reveal the email.
  const segment = account.displayName.toLowerCase() === account.email.toLowerCase()
    ? account.userId
    : account.displayName;
  return `/users/${encodeURIComponent(segment)}`;
}
