import { adminRoute, body } from "@/lib/http";
import { draftFromViral } from "@/lib/viral";

export const maxDuration = 60;
// AI viết bài tương tự + chọn sản phẩm → tạo nháp trong Hàng đợi
export const POST = adminRoute<{ id: string }>(async (req, { id }) => {
  const { extra, productId, noProduct } = await body<{ extra?: string; productId?: string | null; noProduct?: boolean }>(req);
  return draftFromViral(id, { extra, productId: productId || null, noProduct: Boolean(noProduct) });
});
