// "Remove callback URL" (yêu cầu xoá dữ liệu) trong cài đặt Threads app: https://<domain>/api/threads/delete
// Phải trả về { url, confirmation_code } để người dùng tra cứu trạng thái.
import { NextResponse } from "next/server";
import { appOrigin, requestOrigin } from "@/lib/auth";
import { parseSignedRequest, readSignedRequest } from "@/lib/signedRequest";
import { handleDataDeletion } from "@/lib/userData";

export async function POST(req: Request) {
  const data = parseSignedRequest(await readSignedRequest(req));
  if (!data) return NextResponse.json({ error: "signed_request không hợp lệ" }, { status: 400 });
  try {
    const record = await handleDataDeletion(data.user_id);
    const origin = appOrigin() ?? requestOrigin(req);
    return NextResponse.json({ url: `${origin}/data-deletion?code=${record.code}`, confirmation_code: record.code });
  } catch (e) {
    console.error("[threads/delete]", e);
    return NextResponse.json({ error: "Lỗi xử lý" }, { status: 500 });
  }
}
