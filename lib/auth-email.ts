import { env } from "cloudflare:workers";
import { and, eq, gt } from "drizzle-orm";
import { sha256 } from "../app/auth";
import { getDb } from "../db";
import { authTokens } from "../db/schema";

export type AuthTokenPurpose = "verify" | "reset";
const expiryMs = { verify: 24 * 60 * 60 * 1000, reset: 30 * 60 * 1000 };

function isLocal(request: Request) {
  return ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);
}

function publicOrigin(request: Request) {
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

async function deliver(request: Request, to: string, purpose: AuthTokenPurpose, token: string) {
  const link = new URL(purpose === "verify" ? "/verify-email" : "/reset-password", publicOrigin(request));
  link.searchParams.set("token", token);
  if (env.AUTH_EMAIL_MODE === "console" && isLocal(request)) {
    console.info(`RGBoner ${purpose} link for ${to}: ${link}`);
    return;
  }
  assertEmailDeliveryReady(request);
  const verification = purpose === "verify";
  const subject = verification ? "Verify your RGBoner email" : "Reset your RGBoner password";
  const intro = verification ? "Confirm your email address to start using your RGBoner account." : "Use this link to reset your RGBoner password.";
  const text = `${intro}\n\n${link}\n\nThis link expires in ${verification ? "24 hours" : "30 minutes"}. If you did not request it, ignore this email.`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status}).`);
}

export async function issueAuthToken(request: Request, userId: string, email: string, purpose: AuthTokenPurpose) {
  const db = getDb();
  const now = Date.now();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  await db.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)));
  await db.insert(authTokens).values({ tokenHash: await sha256(token), userId, purpose, createdAt: now, expiresAt: now + expiryMs[purpose] });
  await deliver(request, email, purpose, token);
}

export async function consumeAuthToken(token: unknown, purpose: AuthTokenPurpose) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  const [row] = await getDb().delete(authTokens).where(and(eq(authTokens.tokenHash, await sha256(token)), eq(authTokens.purpose, purpose), gt(authTokens.expiresAt, Date.now()))).returning();
  return row ?? null;
}

export async function recentlyIssued(userId: string, purpose: AuthTokenPurpose) {
  const [row] = await getDb().select({ createdAt: authTokens.createdAt }).from(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), gt(authTokens.createdAt, Date.now() - 60_000)));
  return !!row;
}
