// Admin key dự phòng (chỉ bật khi đặt ADMIN_KEY) + đăng xuất.
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { body } from "@/lib/http";
import { clearSessionCookie, currentUser, safeEqual, setSessionCookie } from "@/lib/session";

export async function POST(req: Request) {
  if (!config.adminKey) return NextResponse.json({ error: "Đăng nhập bằng admin key đang tắt — hãy đăng nhập bằng Threads" }, { status: 403 });
  const { key } = await body<{ key?: string }>(req);
  if (!key || !safeEqual(key, config.adminKey)) {
    await new Promise((r) => setTimeout(r, 600)); // làm chậm dò key
    return NextResponse.json({ error: "Admin key không đúng" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, { id: "admin-key", username: "admin", via: "admin-key" });
  return res;
}

// Thông tin người đang đăng nhập
export async function GET() {
  const user = await currentUser();
  return user ? NextResponse.json(user) : NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
