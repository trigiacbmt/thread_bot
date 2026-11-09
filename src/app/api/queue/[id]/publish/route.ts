import { adminRoute, json } from "@/lib/http";
import { publishItem } from "@/lib/queue";

export const POST = adminRoute<{ id: string }>(async (_req, { id }) =>
  (await publishItem(id)) ?? json({ error: "Không tìm thấy" }, 404));
