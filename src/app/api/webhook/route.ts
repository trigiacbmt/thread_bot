// Webhook Threads. Khai báo Callback URL = https://<domain>/api/webhook
import { after } from "next/server";
import { config } from "@/lib/config";
import { validSignature, parseWebhook, processIncoming } from "@/lib/webhook";
import { log } from "@/lib/activity";

export const maxDuration = 60;

// Bước xác minh khi bấm "Verify and save" trong app dashboard của Meta
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === config.webhookVerifyToken) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    await log("error", "Webhook sai chữ ký — bỏ qua");
    return new Response("Invalid signature", { status: 401 });
  }
  const items = parseWebhook(raw);
  // Trả 200 cho Meta ngay, xử lý AI + reply sau khi response đã gửi
  after(() => processIncoming(items).catch((e) => log("error", "Xử lý webhook lỗi", { error: String(e) })));
  return new Response("OK", { status: 200 });
}
