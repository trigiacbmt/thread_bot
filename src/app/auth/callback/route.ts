// Redirect URI của Threads app: https://<domain>/auth/callback
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appOrigin, exchangeCode, saveBotToken, OAUTH_MODE_COOKIE, OAUTH_STATE_COOKIE } from "@/lib/auth";
import { checkAllowed, currentUser, setSessionCookie } from "@/lib/session";
import { tokenStore } from "@/lib/store";
import { log } from "@/lib/activity";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const jar = await cookies();
  const mode = jar.get(OAUTH_MODE_COOKIE)?.value === "connect" ? "connect" : "login";
  const back = (params: string) => {
    // Quay về đúng domain của app (tránh nhảy sang localhost khi chạy sau tunnel)
    const res = NextResponse.redirect(new URL(`/?${params}`, appOrigin() ?? req.url));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    res.cookies.delete(OAUTH_MODE_COOKIE);
    return res;
  };
  if (q.get("error")) return back(`login_error=${encodeURIComponent(q.get("error_description") ?? "Bạn đã huỷ đăng nhập")}`);

  const code = q.get("code")?.replace(/#_$/, "");
  const state = q.get("state");
  if (!code || !state || state !== jar.get(OAUTH_STATE_COOKIE)?.value) {
    return back(`login_error=${encodeURIComponent("Phiên đăng nhập hết hạn, hãy thử lại")}`);
  }

  let t;
  try {
    t = await exchangeCode(code);
  } catch (e) {
    await log("error", "Đăng nhập Threads thất bại", { error: String(e) });
    return back(`login_error=${encodeURIComponent("Threads từ chối đăng nhập: " + String(e).slice(0, 160))}`);
  }

  try {
    const allowed = await checkAllowed({ id: t.userId, username: t.username });
    if (!allowed.ok) {
      await log("auth", `Chặn đăng nhập từ @${t.username}`, { reason: allowed.reason });
      return back(`login_error=${encodeURIComponent(allowed.reason ?? "Tài khoản không được phép")}`);
    }

    // Lưu token cho bot khi: chủ động "kết nối lại", bot chưa có tài khoản, hoặc đúng tài khoản đang chạy bot (gia hạn token).
    // Một người khác trong ALLOWED_THREADS_USERS đăng nhập thì KHÔNG đổi tài khoản bot.
    const current = await tokenStore.get();
    const saveToken = mode === "connect" || !current || current.userId === t.userId;
    if (saveToken) await saveBotToken(t);

    const res = back(saveToken ? "connected=1" : "logged_in=1");
    // Giữ nguyên phiên cũ nếu đang "kết nối lại" từ phiên admin key; còn lại đăng nhập bằng tài khoản Threads này
    const existing = mode === "connect" ? await currentUser() : null;
    setSessionCookie(res, existing ?? { id: t.userId, username: t.username, via: "threads" });
    if (allowed.claimed) await log("auth", `@${t.username} trở thành chủ dashboard (người đăng nhập đầu tiên)`);
    else await log("auth", `@${t.username} đăng nhập dashboard`);
    return res;
  } catch (e) {
    // Thường gặp nhất: chưa chạy supabase/migrations/0001_init.sql, hoặc sai SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auth/callback]", msg);
    const hint = /Could not find the table|relation .* does not exist|schema cache/i.test(msg)
      ? " → Chưa tạo bảng: chạy supabase/migrations/0001_init.sql trong Supabase SQL Editor."
      : /row-level security|key CÔNG KHAI|đang là key/i.test(msg)
        ? " → Đang dùng key công khai. SUPABASE_SECRET_KEY phải là Secret key (sb_secret_…) hoặc service_role."
      : /Invalid API key|JWT|apikey|401/i.test(msg)
        ? " → Kiểm tra SUPABASE_SECRET_KEY (phải là Secret key sb_secret_… hoặc service_role)."
        : /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)
          ? " → Không kết nối được Supabase, kiểm tra SUPABASE_URL."
          : "";
    return back(`login_error=${encodeURIComponent(`Đăng nhập Threads OK nhưng lưu dữ liệu thất bại: ${msg.slice(0, 180)}${hint}`)}`);
  }
}
