// Xử lý webhook Meta: kiểm tra chữ ký và phân loại sự kiện.
import crypto from "node:crypto";
import { config } from "./config";
import { handleIncoming, type Incoming } from "./replyHandler";
import { log } from "./activity";

interface WebhookValue {
  id: string;
  username?: string;
  text?: string;
  media_type?: string;
  permalink?: string;
  replied_to?: { id: string };
  root_post?: { id: string; owner_id?: string; username?: string };
}

interface WebhookPayload {
  app_id?: string;
  topic?: string;
  target_id?: string;
  time?: number;
  values?: { field: string; value: WebhookValue } | Array<{ field: string; value: WebhookValue }>;
}

export function validSignature(raw: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", config.appSecret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Tách payload thành danh sách reply/mention cần xử lý. */
export function parseWebhook(raw: string): Incoming[] {
  let payloads: WebhookPayload[];
  try {
    const parsed = JSON.parse(raw);
    payloads = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    log("error", "Webhook body không phải JSON");
    return [];
  }
  const out: Incoming[] = [];
  for (const p of payloads) {
    const values = Array.isArray(p.values) ? p.values : p.values ? [p.values] : [];
    for (const { field, value } of values) {
      if (field === "replies" || field === "mentions") {
        out.push({
          id: value.id,
          text: value.text,
          username: value.username,
          kind: field === "replies" ? "reply" : "mention",
          rootPostId: value.root_post?.id,
        });
      } else {
        log("info", `Webhook ${field}`, value);
      }
    }
  }
  return out;
}

export async function processIncoming(items: Incoming[]) {
  for (const item of items) await handleIncoming(item);
}
