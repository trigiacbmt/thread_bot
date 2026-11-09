// Bắt đầu OAuth Threads.
//   /auth/login               → đăng nhập dashboard (lần đầu cũng kết nối bot với tài khoản này)
//   /auth/login?mode=connect  → (đã đăng nhập) kết nối lại / đổi tài khoản bot
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { appOrigin, authUrl, requestOrigin, OAUTH_MODE_COOKIE, OAUTH_STATE_COOKIE } from "@/lib/auth";
import { isAdmin } from "@/lib/http";

export async function GET(req: Request) {
  const origin = appOrigin();
  if (!origin) {
    const msg = "Chưa cấu hình THREADS_REDIRECT_URI (dạng https://<domain>/auth/callback) trong .env.local";
    return NextResponse.redirect(new URL(`/?login_error=${encodeURIComponent(msg)}`, req.url));
  }
  // Cookie chống giả mạo (state) phải nằm trên ĐÚNG domain mà Threads sẽ redirect về.
  // Nếu đang mở bằng localhost / domain khác → chuyển sang domain của THREADS_REDIRECT_URI trước.
  const current = requestOrigin(req);
  if (current !== origin) {
    const u = new URL(req.url);
    return NextResponse.redirect(new URL(u.pathname + u.search, origin));
  }

  const wantsConnect = new URL(req.url).searchParams.get("mode") === "connect";
  const mode = wantsConnect && (await isAdmin()) ? "connect" : "login";
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state));
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: origin.startsWith("https://"), path: "/auth", maxAge: 600 };
  res.cookies.set(OAUTH_STATE_COOKIE, state, opts);
  res.cookies.set(OAUTH_MODE_COOKIE, mode, opts);
  return res;
}
