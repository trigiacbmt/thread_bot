import { adminRoute, body } from "@/lib/http";
import { setViralStatus, type ViralPost } from "@/lib/viral";

export const PATCH = adminRoute<{ id: string }>(async (req, { id }) => {
  const { status } = await body<{ status?: ViralPost["status"] }>(req);
  if (!status || !["new", "used", "dismissed"].includes(status)) throw new Error("Trạng thái không hợp lệ");
  await setViralStatus(id, status);
  return { ok: true };
});
