// "Uninstall callback URL" trong cài đặt Threads app: https://<domain>/api/threads/uninstall
// Meta gọi khi người dùng gỡ quyền của app trên Threads.
import { NextResponse } from "next/server";
import { parseSignedRequest, readSignedRequest } from "@/lib/signedRequest";
import { handleUninstall } from "@/lib/userData";

export async function POST(req: Request) {
  const data = parseSignedRequest(await readSignedRequest(req));
  if (!data) return NextResponse.json({ error: "signed_request không hợp lệ" }, { status: 400 });
  try {
    await handleUninstall(data.user_id);
  } catch (e) {
    console.error("[threads/uninstall]", e);
    return NextResponse.json({ error: "Lỗi xử lý" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
