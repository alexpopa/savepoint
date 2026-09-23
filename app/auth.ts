import { and, eq, gt, isNotNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { accounts, sessions } from "../db/schema";

export type AppUser = { userId: string; email: string; displayName: string };

const cookieName = "rgboner_session";
const sessionLengthMs = 30 * 24 * 60 * 60 * 1000;
// The Worker runtime rejects PBKDF2 iteration counts above 100,000.
const passwordIterations = 100_000;
const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unhex(value: string): Uint8Array | null {
  if (value.length % 2 || !/^[0-9a-f]+$/i.test(value)) return null;
  return Uint8Array.from(value.match(/../g) ?? [], (part) => parseInt(part, 16));
}

export async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export function loginAttemptKey(email: string): Promise<string> {
  return sha256(email);
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2_sha256$${passwordIterations}$${hex(salt)}$${hex(await derivePassword(password, salt, passwordIterations))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, rawIterations, rawSalt, rawHash] = stored.split("$");
  const iterations = Number(rawIterations);
  const salt = unhex(rawSalt ?? "");
  const expected = unhex(rawHash ?? "");
  if (algorithm !== "pbkdf2_sha256" || iterations !== passwordIterations || salt?.length !== 16 || expected?.length !== 32) return false;
  const actual = await derivePassword(password, salt, iterations);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

export function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || url.pathname.startsWith("/login") || url.pathname.startsWith("/api/auth")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function sessionFromCookie(cookieHeader: string | null): string | null {
  const matches = (cookieHeader ?? "").split(";").map((item) => item.trim()).filter((item) => item.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(cookieName.length + 1);
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = sessionFromCookie((await headers()).get("cookie"));
  if (!token) return null;
  const [row] = await getDb().select({ userId: accounts.userId, email: accounts.email, displayName: accounts.displayName })
    .from(sessions).innerJoin(accounts, eq(sessions.userId, accounts.userId))
    .where(and(eq(sessions.tokenHash, await sha256(token)), gt(sessions.expiresAt, Date.now()), isNotNull(accounts.passwordHash), isNotNull(accounts.emailVerifiedAt)));
  return row ?? null;
}

export async function requireUser(returnTo: string): Promise<AppUser> {
  const user = await getCurrentUser();
  if (user) return user;
  redirect(`/login?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
}

export async function createSession(userId: string, request: Request): Promise<string> {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await getDb().insert(sessions).values({ tokenHash: await sha256(token), userId, expiresAt: Date.now() + sessionLengthMs });
  return `${cookieName}=${token}; Path=/; Max-Age=${sessionLengthMs / 1000}; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export async function deleteSession(request: Request): Promise<void> {
  const token = sessionFromCookie(request.headers.get("cookie"));
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
}

export function clearSessionCookie(request: Request): string {
  return `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
