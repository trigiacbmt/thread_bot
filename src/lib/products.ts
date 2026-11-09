// Kho sản phẩm Shopee (link tiếp thị liên kết).
import { db, must } from "./db";

export interface Product {
  id: string;
  name: string;
  affiliateUrl: string;
  originalUrl?: string | null;
  keywords: string[];
  note?: string | null;
  price?: string | null;
  active: boolean;
  usedCount: number;
  createdAt: string;
}

type Row = Record<string, unknown>;

const fromRow = (r: Row): Product => ({
  id: r.id as string,
  name: r.name as string,
  affiliateUrl: r.affiliate_url as string,
  originalUrl: r.original_url as string | null,
  keywords: (r.keywords as string[]) ?? [],
  note: r.note as string | null,
  price: r.price as string | null,
  active: r.active as boolean,
  usedCount: (r.used_count as number) ?? 0,
  createdAt: r.created_at as string,
});

function toRow(p: Partial<Product>): Row {
  const row: Row = {};
  if (p.name !== undefined) row.name = p.name.trim();
  if (p.affiliateUrl !== undefined) row.affiliate_url = p.affiliateUrl.trim();
  if (p.originalUrl !== undefined) row.original_url = p.originalUrl?.trim() || null;
  if (p.keywords !== undefined) row.keywords = p.keywords.map((k) => k.trim()).filter(Boolean);
  if (p.note !== undefined) row.note = p.note?.trim() || null;
  if (p.price !== undefined) row.price = p.price?.trim() || null;
  if (p.active !== undefined) row.active = p.active;
  return row;
}

export function assertUrl(u: string) {
  try {
    const url = new URL(u);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error(`Link không hợp lệ: ${u}`);
  }
}

export const products = {
  async list(onlyActive = false): Promise<Product[]> {
    let q = db().from("products").select("*").order("created_at", { ascending: false }).limit(500);
    if (onlyActive) q = q.eq("active", true);
    return (must(await q) as Row[]).map(fromRow);
  },

  async get(id: string): Promise<Product | null> {
    const r = must(await db().from("products").select("*").eq("id", id).maybeSingle());
    return r ? fromRow(r as Row) : null;
  },

  async add(p: Pick<Product, "name" | "affiliateUrl"> & Partial<Product>): Promise<Product> {
    if (!p.name?.trim()) throw new Error("Thiếu tên sản phẩm");
    assertUrl(p.affiliateUrl);
    const r = must(await db().from("products").insert(toRow({ keywords: [], ...p })).select().single());
    return fromRow(r as Row);
  },

  async update(id: string, patch: Partial<Product>): Promise<Product | null> {
    if (patch.affiliateUrl) assertUrl(patch.affiliateUrl);
    const r = must(await db().from("products").update(toRow(patch)).eq("id", id).select().maybeSingle());
    return r ? fromRow(r as Row) : null;
  },

  async remove(id: string) {
    must(await db().from("products").delete().eq("id", id));
  },

  async markUsed(id: string) {
    const p = await products.get(id);
    if (p) must(await db().from("products").update({ used_count: p.usedCount + 1 }).eq("id", id));
  },
};

/**
 * Lọc sơ bộ các sản phẩm liên quan (theo từ khoá) trước khi đưa cho AI chọn,
 * để prompt gọn khi kho lớn. Không có sản phẩm nào khớp thì trả toàn bộ (tối đa `limit`).
 */
export function shortlist(all: Product[], hints: string[], limit = 25): Product[] {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  const words = hints.flatMap((h) => norm(h).split(/[^a-z0-9]+/)).filter((w) => w.length >= 3);
  if (!words.length) return all.slice(0, limit);
  const scored = all
    .map((p) => {
      const hay = norm([p.name, ...p.keywords, p.note ?? ""].join(" "));
      return { p, score: words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) };
    })
    .sort((a, b) => b.score - a.score || a.p.usedCount - b.p.usedCount);
  const hits = scored.filter((x) => x.score > 0).map((x) => x.p);
  return (hits.length ? hits : all).slice(0, limit);
}
