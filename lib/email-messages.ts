import type { EmailMessage } from "./email";

// Builds message content only, so tests can check wording and links without the Worker runtime.
export function friendRequestEmail(to: string, requesterName: string, origin: string, requesterProfilePath: string): EmailMessage {
  const accept = new URL("/settings", origin);
  const profile = new URL(requesterProfilePath, origin);
  return {
    to,
    subject: `${requesterName} sent you a friend request on RGBoner`,
    text: `${requesterName} wants to be friends on RGBoner.\n\nAccept or decline the request in Settings & friends:\n${accept}\n\nView their profile:\n${profile}\n\nIf you do not know this player, you can decline the request or ignore this email.`,
  };
}
