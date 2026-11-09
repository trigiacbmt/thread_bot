import { adminRoute, body } from "@/lib/http";
import { queue, publishItem } from "@/lib/queue";

export const GET = adminRoute(() => queue.list());

export const POST = adminRoute(async (req) => {
  const { text, imageUrl, scheduledAt, publishNow, productId, productLine, linkMode } = await body<{
    text?: string; imageUrl?: string; scheduledAt?: string; publishNow?: boolean;
    productId?: string; productLine?: string; linkMode?: "reply" | "inline" | "none";
  }>(req);
  if (!text?.trim()) throw new Error("Nội dung trống");
  const item = await queue.add({
    text: text.trim(), imageUrl: imageUrl || null, scheduledAt: scheduledAt || null, source: "manual", status: "scheduled",
    productId: productId || null, productLine: productLine || null, linkMode: productId ? (linkMode ?? "reply") : "none",
  });
  return publishNow ? publishItem(item.id) : item;
});
