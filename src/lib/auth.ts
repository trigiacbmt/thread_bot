// OAuth Threads: tạo URL đăng nhập, đổi code → token dài hạn, tự refresh.
import { config } from "./config";
import { tokenStore } from "./store";
import { GRAPH, rawRequest } from "./threadsClient";
import { log } from "./activity";

const DAY = 24 * 60 * 60 * 1000;
export const OAUTH_STATE_COOKIE = "threads_oauth_state";
/** "login": đăng nhập dashboard (+ kết nối bot nếu chưa có) · "connect": chủ động đổi tài khoản bot */
export const OAUTH_MODE_COOKIE = "threads_oauth_mode";

/** Origin (https://domain) của THREADS_REDIRECT_URI, hoặc null nếu chưa cấu hình / sai định dạng. */
export function appOrigin(): string | null {
  const raw = process.env.THREADS_REDIRECT_URI;
  if (!raw) return null;
  try { return new URL(raw).origin; } catch { return null; }
}

/** Origin mà trình duyệt đang dùng (tính cả khi chạy sau tunnel / proxy). */
export function requestOrigin(req: Request): string {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function authUrl(state: string): string {
  const sp = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(","),
    response_type: "code",
    state,
  });
  return `https://threads.com/oauth/authorize?${sp}`;
}

export interface ExchangedToken {
  accessToken: string;
  expiresAt: number;
  obtainedAt: number;
  userId: string;
  username: string;
}

/** Đổi code → token ngắn hạn → token dài hạn (60 ngày) + lấy hồ sơ. CHƯA lưu gì. */
export async function exchangeCode(code: string): Promise<ExchangedToken> {
  const short = await rawRequest<{ access_token: string; user_id: string | number }>(
    "POST",
    `${GRAPH}/oauth/access_token`,
    {
      client_id: config.appId,
      client_secret: config.appSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    },
  );
  const long = await rawRequest<{ access_token: string; expires_in: number }>(
    "GET",
    `${GRAPH}/access_token`,
    { grant_type: "th_exchange_token", client_secret: config.appSecret, access_token: short.access_token },
  );
  const me = await rawRequest<{ id: string; username: string }>("GET", `${GRAPH}/v1.0/me`, {
    fields: "id,username",
    access_token: long.access_token,
  });
  const now = Date.now();
  return {
    accessToken: long.access_token,
    expiresAt: now + long.expires_in * 1000,
    obtainedAt: now,
    userId: String(me.id ?? short.user_id),
    username: me.username,
  };
}

/** Lưu token để bot hoạt động bằng tài khoản này. */
export async function saveBotToken(t: ExchangedToken) {
  await tokenStore.set({ accessToken: t.accessToken, userId: t.userId, username: t.username, expiresAt: t.expiresAt, obtainedAt: t.obtainedAt });
  await log("auth", `Bot đã kết nối tài khoản @${t.username}`);
}

/** Refresh khi token đã >= 24h tuổi và còn < 7 ngày là hết hạn (hoặc force). */
export async function refreshTokenIfNeeded(force = false) {
  const t = await tokenStore.get();
  if (!t) return;
  const now = Date.now();
  if (now >= t.expiresAt) {
    await log("error", "Token đã hết hạn — cần kết nối lại tài khoản");
    return;
  }
  const oldEnough = now - t.obtainedAt >= DAY;
  const nearExpiry = t.expiresAt - now < 7 * DAY;
  if (!oldEnough) {
    if (force) throw new Error("Token mới lấy chưa đủ 24 giờ, Threads chưa cho refresh");
    return;
  }
  if (!nearExpiry && !force) return;

  const r = await rawRequest<{ access_token: string; expires_in: number }>(
    "GET",
    `${GRAPH}/refresh_access_token`,
    { grant_type: "th_refresh_token", access_token: t.accessToken },
  );
  await tokenStore.set({ ...t, accessToken: r.access_token, expiresAt: now + r.expires_in * 1000, obtainedAt: now });
  await log("auth", "Đã refresh token (còn hạn 60 ngày)");
}
