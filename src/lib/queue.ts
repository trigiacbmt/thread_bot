// Hàng đợi bài đăng: nháp (chờ duyệt) → đã lên lịch → đang đăng → đã đăng / lỗi.
import { db, must } from "./db";
import { publish, reply, threadsLength, MAX_TEXT } from "./threadsClient";
import { products } from "./products";
import { getSettings } from "./settings";
import { log } from "./activity";

export type QueueStatus = "draft" | "scheduled" | "publishing" | "posted" | "failed";

export interface QueueItem {
  id: string;
  text: string;
  imageUrl?: string | null;
  topic?: string | null;
  source: "manual" | "ai" | "viral";
  status: QueueStatus;
  scheduledAt?: string | null; // trống = đăng ở lượt tick kế tiếp
  createdAt: string;
  postedAt?: string | null;
  postId?: string | null;
  error?: string | null;
  inspiredBy?: string | null; // id bài viral làm nguồn cảm hứng
  productId?: string | null;
  productLine?: string | null; // câu giới thiệu sản phẩm đặt cạnh link
  linkMode?: LinkMode;
  replyPostId?: string | null; // id reply chứa link (khi linkMode = reply)
}

/** reply: link nằm trong reply đầu tiên của chính mình · inline: link ở cuối bài · none: không gắn link */
export type LinkMode = "reply" | "inline" | "none";

type Row = Record<string, unknown>;

const fromRow = (r: Row): QueueItem => ({
  id: r.id as string,
  text: r.text as string,
  imageUrl: r.image_url as string | null,
  topic: r.topic as string | null,
  source: r.source as QueueItem["source"],
  status: r.status as QueueStatus,
  scheduledAt: r.scheduled_at as string | null,
  createdAt: r.created_at as string,
  postedAt: r.posted_at as string | null,
  postId: r.post_id as string | null,
  error: r.error as string | null,
  inspiredBy: r.inspired_by as string | null,
  productId: r.product_id as string | null,
  productLine: r.product_line as string | null,
  linkMode: (r.link_mode as LinkMode) ?? "reply",
  replyPostId: r.reply_post_id as string | null,
});

function toRow(p: Partial<QueueItem>): Row {
  const map: Record<string, string> = {
    text: "text", imageUrl: "image_url", topic: "topic", source: "source", status: "status",
    scheduledAt: "scheduled_at", postedAt: "posted_at", postId: "post_id", error: "error",
    inspiredBy: "inspired_by", productId: "product_id", productLine: "product_line",
    linkMode: "link_mode", replyPostId: "reply_post_id",
  };
  const row: Row = {};
  for (const [k, col] of Object.entries(map)) {
    const v = (p as Row)[k];
    if (v !== undefined) row[col] = v;
  }
  return row;
}

export const queue = {
  async list(): Promise<QueueItem[]> {
    const rows = must(await db().from("queue_items").select("*").order("created_at", { ascending: false }).limit(300));
    return (rows as Row[]).map(fromRow);
  },

  async get(id: string): Promise<QueueItem | null> {
    const r = must(await db().from("queue_items").select("*").eq("id", id).maybeSingle());
    return r ? fromRow(r as Row) : null;
  },

  async add(item: Omit<QueueItem, "id" | "createdAt">): Promise<QueueItem> {
    const r = must(await db().from("queue_items").insert(toRow(item)).select().single());
    return fromRow(r as Row);
  },

  async update(id: string, patch: Partial<QueueItem>): Promise<QueueItem | null> {
    const row = toRow(patch);
    if (!Object.keys(row).length) return queue.get(id);
    const r = must(await db().from("queue_items").update(row).eq("id", id).select().maybeSingle());
    return r ? fromRow(r as Row) : null;
  },

  async remove(id: string): Promise<void> {
    must(await db().from("queue_items").delete().eq("id", id));
  },
};

function fitText(text: string, budget: number): string {
  const t = text.trim();
  if (threadsLength(t) <= budget) return t;
  let out = "";
  for (const ch of t) {
    if (threadsLength(out + ch) > budget - 1) break;
    out += ch;
  }
  return out.trimEnd() + "…";
}

/** Dòng chứa link sản phẩm (kèm câu giới thiệu + ghi chú tiếp thị liên kết nếu có). */
export async function buildLinkLine(item: Pick<QueueItem, "productId" | "productLine">) {
  if (!item.productId) return null;
  const [product, s] = await Promise.all([products.get(item.productId), getSettings()]);
  if (!product) return null;
  const intro = item.productLine?.trim() || `👉 ${product.name}:`;
  const line = [`${intro} ${product.affiliateUrl}`, s.affiliateDisclosure?.trim()].filter(Boolean).join("\n");
  return { url: product.affiliateUrl, line, productId: product.id };
}

async function doPublish(item: QueueItem): Promise<QueueItem | null> {
  try {
    const s = await getSettings();
    const postOpts = { topicTag: s.topicTag || undefined, replyControl: s.replyControl };
    const link = item.linkMode !== "none" ? await buildLinkLine(item) : null;
    let postId: string;
    let replyPostId: string | null = null;
    let note: string | null = null;

    if (link && item.linkMode === "inline") {
      // Link ở cuối bài, rút gọn thân bài nếu vượt 500 ký tự
      const body = fitText(item.text, MAX_TEXT - threadsLength(link.line) - 2);
      postId = await publish({ text: `${body}\n\n${link.line}`, imageUrl: item.imageUrl ?? undefined, linkAttachment: link.url, ...postOpts });
    } else {
      postId = await publish({ text: item.text, imageUrl: item.imageUrl ?? undefined, ...postOpts });
      if (link) {
        // Reply đầu tiên chứa link sản phẩm
        try {
          replyPostId = await reply(postId, link.line, link.url);
        } catch (e) {
          note = `Đã đăng bài nhưng reply chứa link thất bại: ${String(e)}`;
          await log("error", note, { queueId: item.id, postId });
        }
      }
    }
    if (link && (replyPostId || item.linkMode === "inline")) await products.markUsed(link.productId);
    await log("post", `Đã đăng: ${item.text.slice(0, 80)}${link ? " (kèm link sản phẩm)" : ""}`, { postId, replyPostId, queueId: item.id });
    return queue.update(item.id, { status: "posted", postId, replyPostId, postedAt: new Date().toISOString(), error: note });
  } catch (e) {
    await log("error", "Đăng bài thất bại", { queueId: item.id, error: String(e) });
    return queue.update(item.id, { status: "failed", error: String(e) });
  }
}

/** Đăng ngay một bài (từ dashboard). */
export async function publishItem(id: string): Promise<QueueItem | null> {
  const item = await queue.get(id);
  if (!item) return null;
  if (item.status === "posted" || item.status === "publishing") return item;
  await queue.update(id, { status: "publishing" });
  return doPublish(item);
}

/** Đăng các bài "scheduled" đã đến giờ. Dùng hàm SQL để không bao giờ đăng trùng. */
export async function processDue(maxPerRun = 5): Promise<number> {
  let n = 0;
  for (; n < maxPerRun; n++) {
    const rows = must(await db().rpc("claim_due_queue_item")) as Row[] | null;
    if (!rows?.length) break;
    await doPublish(fromRow(rows[0]));
  }
  return n;
}
