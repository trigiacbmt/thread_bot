// Giải mã + xác thực signed_request Meta gửi tới callback gỡ app / xoá dữ liệu.
// Định dạng: "<chữ ký base64url>.<payload base64url>", chữ ký = HMAC-SHA256(payload, THREADS_APP_SECRET).
import crypto from "node:crypto";
import { config } from "./config";

export interface SignedRequestPayload {
  algorithm: string;
  user_id: string;
  issued_at?: number;
  expires?: number;
}

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function parseSignedRequest(signed: string | null | undefined): SignedRequestPayload | null {
  if (!signed || !signed.includes(".")) return null;
  const [encodedSig, payload] = signed.split(".", 2);
  const sig = fromB64url(encodedSig);
  const expected = crypto.createHmac("sha256", config.appSecret).update(payload).digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(fromB64url(payload).toString("utf8")) as SignedRequestPayload;
    if (String(data.algorithm).toUpperCase() !== "HMAC-SHA256" || !data.user_id) return null;
    return { ...data, user_id: String(data.user_id) };
  } catch {
    return null;
  }
}

/** Đọc signed_request từ body form (Meta gửi application/x-www-form-urlencoded) hoặc JSON. */
export async function readSignedRequest(req: Request): Promise<string | null> {
  const type = req.headers.get("content-type") ?? "";
  const raw = await req.text();
  if (type.includes("application/json")) {
    try { return (JSON.parse(raw) as { signed_request?: string }).signed_request ?? null; } catch { return null; }
  }
  return new URLSearchParams(raw).get("signed_request");
}
