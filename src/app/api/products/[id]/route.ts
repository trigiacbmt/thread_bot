import { adminRoute, body, json } from "@/lib/http";
import { products, type Product } from "@/lib/products";

export const PATCH = adminRoute<{ id: string }>(async (req, { id }) =>
  (await products.update(id, await body<Partial<Product>>(req))) ?? json({ error: "Không tìm thấy" }, 404));

export const DELETE = adminRoute<{ id: string }>(async (_req, { id }) => {
  await products.remove(id);
  return { ok: true };
});
