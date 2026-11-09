"use client";
import { useEffect, useState } from "react";
import { Check, Flame, ListChecks, Pencil, Send, ShoppingBag, Sparkles } from "lucide-react";
import { api, charLen, fmtTime, fromLocalInput, toLocalInput, useAction, useApi, useStatus } from "@/components/client";
import {
  ConfirmButton, Counter, EmptyState, Field, FilterChips, LINK_MODE_VI, ListSkeleton, PageHeader, ProductPicker, STATUS_VI, Spinner,
  type ProductOption,
} from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";

type LinkMode = "reply" | "inline" | "none";
interface QueueItem {
  id: string; text: string; topic?: string | null; source: "manual" | "ai" | "viral";
  status: "draft" | "scheduled" | "publishing" | "posted" | "failed";
  scheduledAt?: string | null; createdAt: string; postedAt?: string | null; error?: string | null;
  inspiredBy?: string | null; productId?: string | null; productLine?: string | null; linkMode?: LinkMode;
}
interface ViralLite { id: string; username: string | null; permalink: string | null }
type F = "all" | QueueItem["status"];

const SOURCE_VI = { manual: "Thủ công", ai: "AI theo chủ đề", viral: "Từ bài viral" };

export default function QueuePage() {
  const { data, loading, reload } = useApi<QueueItem[]>("/queue", 30_000);
  const { status } = useStatus();
  const { data: products } = useApi<ProductOption[]>("/products");
  const { data: viral } = useApi<ViralLite[]>("/viral?status=used&limit=300");
  const { busy, run } = useAction();
  const [filter, setFilter] = useState<F>("all");
  const [editing, setEditing] = useState<QueueItem | null>(null);
  const items = (data ?? []).filter((x) => filter === "all" || x.status === filter);
  const count = (s: QueueItem["status"]) => data?.filter((x) => x.status === s).length ?? 0;
  const product = (id?: string | null) => products?.find((p) => p.id === id);
  const source = (id?: string | null) => viral?.find((v) => v.id === id);
  const act = (key: string, fn: () => Promise<unknown>, msg: string) => run(key, async () => { await fn(); await reload(); }, msg);

  return (
    <>
      <PageHeader title="Hàng đợi" description={`Nháp do AI viết cần bạn duyệt trước khi đăng.${status?.affiliateEnabled ? " Link sản phẩm (nếu có) được gắn tự động lúc đăng." : ""}`}>
        <Button variant="outline" disabled={!!busy} onClick={() => act("gen", () => api("/ai/generate-now", { method: "POST" }), "AI đã tạo bài mới")}>
          {busy === "gen" ? <Spinner /> : <Sparkles />} AI viết theo chủ đề
        </Button>
      </PageHeader>

      <FilterChips<F> value={filter} onChange={setFilter} options={[
        ["all", "Tất cả"],
        ["draft", <>Nháp {count("draft") > 0 && <Badge variant="warning" className="h-5 px-1.5">{count("draft")}</Badge>}</>],
        ["scheduled", "Đã lên lịch"], ["posted", "Đã đăng"], ["failed", "Lỗi"],
      ]} />

      {loading ? <ListSkeleton /> : !items.length ? (
        <Card><CardContent><EmptyState icon={<ListChecks />}>Không có bài nào</EmptyState></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((x) => {
            const p = product(x.productId);
            const src = source(x.inspiredBy);
            const [label, variant] = STATUS_VI[x.status];
            return (
              <Card key={x.id} className="gap-3">
                <CardContent className="space-y-3">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <Badge variant={variant}>{label}</Badge>
                    <span className="inline-flex items-center gap-1">{x.source === "viral" && <Flame className="size-3" />}{x.source === "ai" && <Sparkles className="size-3" />}{SOURCE_VI[x.source]}</span>
                    {src && <span>· từ {src.permalink ? <a className="underline" href={src.permalink} target="_blank" rel="noopener noreferrer">@{src.username}</a> : `@${src.username}`}</span>}
                    <span>· {x.postedAt ? `đã đăng ${fmtTime(x.postedAt)}` : x.scheduledAt && x.status === "scheduled" ? `đăng lúc ${fmtTime(x.scheduledAt)}` : `tạo ${fmtTime(x.createdAt)}`}</span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap md:text-[15px]">{x.text}</p>
                  {p && x.linkMode !== "none" && (
                    <div className="bg-muted/60 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
                      <ShoppingBag className="mt-0.5 size-3.5 shrink-0" />
                      <div className="min-w-0"><span className="font-medium">{p.name}</span> · {LINK_MODE_VI[x.linkMode ?? "reply"]}
                        {x.productLine && <div className="text-muted-foreground truncate">“{x.productLine}”</div>}</div>
                    </div>
                  )}
                  {x.error && <p className="text-destructive text-xs break-words">{x.error}</p>}
                  {x.status !== "posted" && x.status !== "publishing" && (
                    <div className="flex flex-wrap gap-2">
                      {x.status === "draft" && (
                        <Button size="sm" className="flex-1 md:flex-none" disabled={!!busy}
                          onClick={() => act(x.id + "ok", () => api(`/queue/${x.id}`, { method: "PATCH", body: { status: "scheduled" } }), "Đã duyệt — sẽ đăng ở phút kế tiếp hoặc đúng giờ hẹn")}>
                          <Check /> Duyệt
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="flex-1 md:flex-none" disabled={!!busy}
                        onClick={() => act(x.id + "pub", async () => {
                          const r = await api<QueueItem>(`/queue/${x.id}/publish`, { method: "POST" });
                          if (r.status === "failed") throw new Error(r.error ?? "Đăng thất bại");
                        }, "Đã đăng")}>
                        {busy === x.id + "pub" ? <Spinner /> : <Send />} Đăng ngay
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(x)}><Pencil /> Sửa</Button>
                      <ConfirmButton label="Xoá" confirmLabel="Xoá thật?" disabled={!!busy}
                        onConfirm={() => act(x.id + "del", () => api(`/queue/${x.id}`, { method: "DELETE" }), "Đã xoá")} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EditDialog item={editing} products={products ?? []} showProducts={!!status?.affiliateEnabled || !!editing?.productId} onClose={() => setEditing(null)}
        onSave={(patch) => act("save", () => api(`/queue/${editing!.id}`, { method: "PATCH", body: patch }), "Đã lưu")} />
    </>
  );
}

function EditDialog({ item, products, showProducts, onClose, onSave }: {
  item: QueueItem | null; products: ProductOption[]; showProducts: boolean; onClose: () => void; onSave: (patch: Partial<QueueItem>) => Promise<unknown>;
}) {
  const max = useStatus().status?.maxText ?? 500;
  const [text, setText] = useState("");
  const [at, setAt] = useState("");
  const [productId, setProductId] = useState("");
  const [productLine, setProductLine] = useState("");
  const [linkMode, setLinkMode] = useState<LinkMode>("reply");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!item) return;
    setText(item.text); setAt(toLocalInput(item.scheduledAt)); setProductId(item.productId ?? "");
    setProductLine(item.productLine ?? ""); setLinkMode(item.linkMode && item.linkMode !== "none" ? item.linkMode : "reply");
  }, [item]);

  return (
    <ResponsiveDialog open={!!item} onOpenChange={(o) => !o && onClose()} title="Sửa bài"
      footer={
        <Button disabled={saving || !text.trim() || charLen(text) > max} onClick={async () => {
          setSaving(true);
          try {
            await onSave({
              text: text.trim(), scheduledAt: fromLocalInput(at) ?? null,
              productId: productId || null, productLine: productLine.trim() || null, linkMode: productId ? linkMode : "none",
            });
            onClose();
          } finally { setSaving(false); }
        }}>{saving && <Spinner />} Lưu</Button>
      }>
      <div className="grid gap-4 pb-2">
        <div className="grid gap-1.5"><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-44" /><Counter text={text} /></div>
        {showProducts && <ProductPicker products={products} value={productId} onChange={setProductId} linkMode={linkMode} onLinkMode={setLinkMode} />}
        {showProducts && productId && linkMode !== "none" && (
          <Field label="Câu giới thiệu đặt cạnh link">
            <Input value={productLine} onChange={(e) => setProductLine(e.target.value)} placeholder="👉 Hộp mình đang dùng:" />
          </Field>
        )}
        <Field label="Lên lịch (để trống = đăng ở phút kế tiếp sau khi duyệt)">
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
      </div>
    </ResponsiveDialog>
  );
}
