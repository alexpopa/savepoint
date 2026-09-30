// Older accounts can use their email as the stored name. Keep those on the
// original opaque URL so a public profile link does not reveal the email.
function accountSegment(account: { userId: string; displayName: string; email: string }) {
  const segment = account.displayName.toLowerCase() === account.email.toLowerCase()
    ? account.userId
    : account.displayName;
  return encodeURIComponent(segment);
}

export function profilePath(account: { userId: string; displayName: string; email: string }): string {
  return `/users/${accountSegment(account)}`;
}

export function messagesPath(account: { userId: string; displayName: string; email: string }): string {
  return `/messages/${accountSegment(account)}`;
}
