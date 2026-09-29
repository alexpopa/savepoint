import { env } from "cloudflare:workers";

export type EmailMessage = { to: string; subject: string; text: string };

function isLocal(request: Request) {
  return ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
}

// Links in email must point at the configured Site origin, never the request Host header.
export function publicOrigin(request: Request) {
  if (isLocal(request)) return new URL(request.url).origin;
  const configured = env.AUTH_PUBLIC_URL;
  if (!configured) throw new Error("AUTH_PUBLIC_URL is not configured.");
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("AUTH_PUBLIC_URL must be an HTTPS origin.");
  return url.origin;
}

export function assertEmailDeliveryReady(request: Request) {
  publicOrigin(request);
  if (env.AUTH_EMAIL_MODE === "console" && isLocal(request)) return;
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) throw new Error("Email delivery is not configured.");
}

export async function sendEmail(request: Request, message: EmailMessage) {
  if (env.AUTH_EMAIL_MODE === "console" && isLocal(request)) {
    console.info(`RGBoner email to ${message.to}: ${message.subject}\n${message.text}`);
    return;
  }
  assertEmailDeliveryReady(request);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text }),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status}).`);
}
