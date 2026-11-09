// Tiện ích cho route handler: kiểm tra phiên đăng nhập, trả JSON, bắt lỗi.
import "server-only";
import { NextResponse } from "next/server";
import { currentUser, safeEqual } from "./session";

export { safeEqual };

/** Đã đăng nhập dashboard (bằng Threads hoặc admin key) chưa. */
export async function isAdmin(): Promise<boolean> {
  return Boolean(await currentUser());
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

type Ctx<P> = { params: Promise<P> };

/** Bọc route handler: bắt buộc đăng nhập admin + trả lỗi dạng JSON. */
export function adminRoute<P = Record<string, string>>(
  fn: (req: Request, params: P) => Promise<unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    if (!(await isAdmin())) return json({ error: "Chưa đăng nhập dashboard" }, 401);
    try {
      const out = await fn(req, await ctx.params);
      return out instanceof Response ? out : json(out === undefined ? { ok: true } : out);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  return (await req.json().catch(() => ({}))) as T;
}
