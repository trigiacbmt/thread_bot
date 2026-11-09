import { adminRoute, body, json } from "@/lib/http";
import { queue, type QueueItem } from "@/lib/queue";

export const PATCH = adminRoute<{ id: string }>(async (req, { id }) => {
  const b = await body<Partial<QueueItem>>(req);
  const allowedStatus = ["draft", "scheduled"];
  if (b.status && !allowedStatus.includes(b.status)) throw new Error("Trạng thái không hợp lệ");
  if (b.linkMode && !["reply", "inline", "none"].includes(b.linkMode)) throw new Error("linkMode không hợp lệ");
  const item = await queue.update(id, {
    text: b.text, imageUrl: b.imageUrl, scheduledAt: b.scheduledAt, status: b.status,
    productId: b.productId, productLine: b.productLine, linkMode: b.linkMode,
  });
  return item ?? json({ error: "Không tìm thấy" }, 404);
});

export const DELETE = adminRoute<{ id: string }>(async (_req, { id }) => {
  await queue.remove(id);
  return { ok: true };
});
