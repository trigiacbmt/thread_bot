"use client";
import { useState } from "react";
import { Pencil, Plus, Search, ShoppingBag } from "lucide-react";
import { api, useAction, useApi, useStatus } from "@/components/client";
import { ConfirmButton, EmptyState, Field, ListSkeleton, PageHeader, Spinner } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

interface Product {
  id: string; name: string; affiliateUrl: string; originalUrl?: string | null; keywords: string[];
  note?: string | null; price?: string | null; active: boolean; usedCount: number; createdAt: string;
}
const blank = { name: "", affiliateUrl: "", originalUrl: "", keywords: "", price: "", note: "" };

export default function ProductsPage() {
  const { status } = useStatus();
  const { data, loading, reload } = useApi<Product[]>("/products");
  const { busy, run } = useAction();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const set = (k: keyof typeof blank, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const items = (data ?? []).filter((p) => !q || [p.name, ...p.keywords].join(" ").toLowerCase().includes(q.toLowerCase()));
  const canSave = form.name.trim() && (form.affiliateUrl.trim() || (status?.shopeeEnabled && form.originalUrl.trim()));

  const openNew = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p.id);
    setForm({ name: p.name, affiliateUrl: p.affiliateUrl, originalUrl: p.originalUrl ?? "", keywords: p.keywords.join(", "), price: p.price ?? "", note: p.note ?? "" });
    setOpen(true);
  };
  const save = () => run("save", async () => {
    const body = {
      name: form.name, affiliateUrl: form.affiliateUrl || undefined, originalUrl: form.originalUrl || null,
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean), price: form.price || null, note: form.note || null,
    };
    if (editing) await api(`/products/${editing}`, { method: "PATCH", body });
    else await api("/products", { method: "POST", body });
    setOpen(false); await reload();
  }, editing ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm");

  return (
    <>
      <PageHeader title="Sản phẩm Shopee" description="Kho link tiếp thị liên kết. Khi viết lại bài viral, AI chọn sản phẩm khớp với mẹo dựa trên tên và từ khoá.">
        <Button onClick={openNew}><Plus /> Thêm sản phẩm</Button>
      </PageHeader>

      <div className="relative mb-4">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Tìm trong ${data?.length ?? 0} sản phẩm…`} className="pl-9" />
      </div>

      {loading ? <ListSkeleton /> : !items.length ? (
        <Card><CardContent><EmptyState icon={<ShoppingBag />}>{q ? "Không tìm thấy" : "Chưa có sản phẩm — bấm “Thêm sản phẩm”"}</EmptyState></CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((p) => (
            <Card key={p.id} className={p.active ? "" : "opacity-60"}>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{p.name}{p.price && <span className="text-muted-foreground font-normal"> · {p.price}</span>}</div>
                    <a href={p.affiliateUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground block truncate text-xs hover:underline">{p.affiliateUrl}</a>
                  </div>
                  <Switch checked={p.active} aria-label="Bật/tắt sản phẩm"
                    onCheckedChange={(v) => run(p.id, async () => { await api(`/products/${p.id}`, { method: "PATCH", body: { active: v } }); await reload(); })} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.keywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}
                  <span className="text-muted-foreground text-xs">· đã dùng {p.usedCount} lần</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Pencil /> Sửa</Button>
                  <ConfirmButton label="Xoá" confirmLabel="Bấm lần nữa để xoá" disabled={!!busy}
                    onConfirm={() => run(p.id, async () => { await api(`/products/${p.id}`, { method: "DELETE" }); await reload(); }, "Đã xoá")} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ResponsiveDialog open={open} onOpenChange={setOpen} title={editing ? "Sửa sản phẩm" : "Thêm sản phẩm"}
        description={status?.shopeeEnabled ? "Có Shopee Affiliate API: để trống link affiliate, bot tự tạo từ link gốc." : "Lấy link affiliate trong trang Shopee Affiliate (Lấy link sản phẩm)."}
        footer={<Button disabled={!!busy || !canSave} onClick={save}>{busy === "save" && <Spinner />} {editing ? "Lưu thay đổi" : "Thêm sản phẩm"}</Button>}>
        <div className="grid gap-4 pb-2">
          <Field label="Tên sản phẩm *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Hộp đựng thực phẩm thuỷ tinh 3 ngăn" /></Field>
          <Field label={`Link affiliate Shopee${status?.shopeeEnabled ? " (để trống = tự tạo)" : " *"}`}>
            <Input type="url" inputMode="url" value={form.affiliateUrl} onChange={(e) => set("affiliateUrl", e.target.value)} placeholder="https://s.shopee.vn/..." />
          </Field>
          <Field label="Link sản phẩm gốc (tuỳ chọn)">
            <Input type="url" inputMode="url" value={form.originalUrl} onChange={(e) => set("originalUrl", e.target.value)} placeholder="https://shopee.vn/..." />
          </Field>
          <Field label="Từ khoá, phân cách bằng dấu phẩy" hint="Giúp AI ghép đúng sản phẩm với mẹo.">
            <Input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="bảo quản thực phẩm, tủ lạnh, nhà bếp" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giá"><Input value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="129.000đ" /></Field>
            <Field label="Ghi chú cho AI"><Input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="dùng được lò vi sóng" /></Field>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
