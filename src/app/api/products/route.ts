import { adminRoute, body } from "@/lib/http";
import { products, type Product } from "@/lib/products";
import { generateShortLink, shopeeEnabled } from "@/lib/shopee";
import { getSettings } from "@/lib/settings";

export const GET = adminRoute(() => products.list());

// Thêm sản phẩm. Nếu chỉ có link Shopee gốc và đã cấu hình Shopee Affiliate API → tự đổi sang link affiliate.
export const POST = adminRoute(async (req) => {
  const b = await body<Partial<Product>>(req);
  let affiliateUrl = b.affiliateUrl?.trim();
  if (!affiliateUrl && b.originalUrl && shopeeEnabled()) {
    const { shopeeSubId } = await getSettings();
    affiliateUrl = await generateShortLink(b.originalUrl.trim(), shopeeSubId ? [shopeeSubId] : []);
  }
  if (!affiliateUrl) throw new Error("Cần link affiliate (hoặc cấu hình Shopee Affiliate API để tự tạo từ link gốc)");
  return products.add({ ...b, name: b.name ?? "", affiliateUrl });
});
