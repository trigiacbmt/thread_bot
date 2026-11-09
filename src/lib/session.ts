// Phiên đăng nhập dashboard: cookie ký HMAC-SHA256, httpOnly, 30 ngày.
// Đăng nhập bằng Threads (OAuth) hoặc admin key dự phòng.
import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { config } from "./config";
import { kvGet, kvSet } from "./db";

export const SESSION_COOKIE = "tb_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 ngày

export interface SessionUser {
  id: string;        // Threads user id ("admin-key" khi đăng nhập bằng admin key)
  username: string;
  via: "threads" | "admin-key";
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sign = (payload: string) => crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function encodeSession(user: SessionUser, now = Date.now()): string {
  const payload = b64(JSON.stringify({ ...user, exp: Math.floor(now / 1000) + MAX_AGE }));
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined): SessionUser | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(unb64(payload)) as SessionUser & { exp: number };
    if (!data.exp || data.exp * 1000 < Date.now()) return null;
    return { id: data.id, username: data.username, via: data.via };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(res: NextResponse, user: SessionUser) {
  res.cookies.set(SESSION_COOKIE, encodeSession(user), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE);
}

// ---------- Ai được vào dashboard ----------
export interface Owner { userId: string; username: string; claimedAt: string }

/**
 * Kiểm tra tài khoản Threads có được vào dashboard không:
 * - Có ALLOWED_THREADS_USERS → chỉ các username trong danh sách.
 * - Không có → tài khoản đăng nhập đầu tiên trở thành chủ (lưu ở kv "dashboard_owner"), sau đó chỉ chủ được vào.
 */
export async function checkAllowed(user: { id: string; username: string }): Promise<{ ok: boolean; claimed?: boolean; reason?: string }> {
  const list = config.allowedThreadsUsers;
  if (list.length) {
    return list.includes(user.username.toLowerCase())
      ? { ok: true }
      : { ok: false, reason: `@${user.username} không có trong ALLOWED_THREADS_USERS` };
  }
  const owner = await kvGet<Owner | null>("dashboard_owner", null);
  if (!owner) {
    await kvSet("dashboard_owner", { userId: user.id, username: user.username, claimedAt: new Date().toISOString() });
    return { ok: true, claimed: true };
  }
  return owner.userId === user.id
    ? { ok: true }
    : { ok: false, reason: `Dashboard này thuộc về @${owner.username}` };
}
