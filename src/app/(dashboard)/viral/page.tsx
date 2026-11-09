"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, Flame, Heart, MessageCircle, Repeat2, Plus, RefreshCw, ShieldAlert, ShoppingBag, Sparkles, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { api, fmtTime, useAction, useApi, useStatus, useToast } from "@/components/client";
import { EmptyState, Field, FilterChips, ListSkeleton, NO_PRODUCT, PageHeader, ProductPicker, Spinner, type ProductOption } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { ScoreBadge } from "./score";

interface ViralPost {
  id: string; keyword: string; text: string | null; username: string | null; permalink: string | null;
  has_replies: boolean; like_count?: number; reply_count?: number; repost_count?: number; posted_at: string | null; found_at: string; seen_count: number; best_rank: number;
  score: number; ai_checked: boolean; is_tip: boolean | null; ai_quality: number | null; ai_reason: string | null;
  ai_product_keywords: string[] | null; status: "new" | "used" | "dismissed";
}
interface Draft { id: string; text: string; productId: string | null; productLine: string | null }
interface Usage { month: string; runs: number; items: number; estUsd: number }
interface ScanResult {
  source?: string; keywords: number; total: number; own: number; scanned: number; newPosts: number; classified: number;
  errors: number; limited: boolean; skipped?: string; usage?: Usage; at: string;
}
interface ScraperRun { at: string; accounts: number; keywords?: number; keywordsOk?: number; searchNeedsLogin?: boolean; ok: number; failed: number; found: number; kept: number; newPosts: number; blocked: boolean; errors: string[] }
interface ScanInfo { last: ScanResult | null; source: "apify" | "scraper" | "meta" | "manual"; scraper: { last: ScraperRun | null; accounts: number; intervalMinutes: number }; apify: { hasToken: boolean; usage: Usage; estRunUsd: number; budget: number } }

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));

function scanSummary(r: ScanResult) {
  if (r.skipped) return r.skipped;
  if (r.source === "scraper") return `AI đã phân loại ${r.classified} bài do scraper lấy về và chấm điểm lại.`;
  if (r.limited) return `Threads trả về ${r.total} bài, ${r.own} là bài của bạn, 0 bài công khai.`;
  return `Quét ${r.keywords} từ khoá: ${r.scanned} bài công khai, ${r.newPosts} bài mới, AI phân loại ${r.classified}.${r.errors ? ` ${r.errors} lỗi (xem Nhật ký).` : ""}${r.usage ? ` Tháng này ≈ $${r.usage.estUsd}.` : ""}`;
}
type F = "new" | "used" | "dismissed";

export default function ViralPage() {
  const { status } = useStatus();
  const [filter, setFilter] = useState<F>("new");
  const [onlyTips, setOnlyTips] = useState(true);
  const { data, loading, reload } = useApi<ViralPost[]>(`/viral?status=${filter}${onlyTips ? "&tips=1" : ""}&limit=100`, 60_000);
  const affiliate = status?.affiliateEnabled ?? false;
  const { data: products } = useApi<ProductOption[]>(affiliate ? "/products" : null);
  const { busy, run } = useAction();
  const notify = useToast();
  const info = useApi<ScanInfo>("/viral/last-scan");
  const lastScan = info.data?.last;
  const source = info.data?.source;
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ url: "", text: "", username: "" });
  const [open, setOpen] = useState<ViralPost | null>(null);
  const [productId, setProductId] = useState("");
  const [extra, setExtra] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const productName = (id: string | null) => products?.find((p) => p.id === id)?.name;

  const setPostStatus = (id: string, s: F) => run(id, async () => {
    await api(`/viral/${id}`, { method: "PATCH", body: { status: s } });
    await reload();
  });

  return (
    <>
      <PageHeader title="Săn bài viral"
        description={`Bài tips đời sống đang nổi (kết quả TOP), AI đã lọc và chấm điểm. Bấm “Viết bài tương tự” để AI viết lại bằng giọng của bạn${affiliate ? " (có thể gắn sản phẩm Shopee)" : ""}.`}>
        <Button variant="outline" onClick={() => { setManual({ url: "", text: "", username: "" }); setManualOpen(true); }}>
          <Plus /> Thêm thủ công
        </Button>
        {source && source !== "manual" && (
          <Button variant="outline" disabled={!!busy || (source === "meta" && !status?.connected) || (source === "apify" && !info.data?.apify.hasToken)}
            title={source === "apify" ? `Quét qua Apify, ≈ $${info.data?.apify.estRunUsd} mỗi lần, mất 1–3 phút` : undefined}
            onClick={() => run("scan", async () => {
              if (source === "apify") notify("Đang quét qua Apify, thường mất 1–3 phút…");
              const r = await api<ScanResult>("/viral/scan", { method: "POST" });
              await Promise.all([reload(), info.reload()]);
              notify(scanSummary(r), r.limited || r.errors > 0 || !!r.skipped);
            })}>
            {busy === "scan" ? <Spinner /> : <RefreshCw />} Quét ngay
          </Button>
        )}
      </PageHeader>

      {!!data?.some((p) => !p.ai_checked) && (
        <Card className="mb-4 py-3">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{data.filter((p) => !p.ai_checked).length} bài đang chờ AI phân loại (không tốn phí quét).</span>
            <Button size="sm" variant="outline" disabled={!!busy}
              onClick={() => run("classify", async () => {
                const r = await api<{ classified: number }>("/viral/scan?classify=1", { method: "POST" });
                await reload();
                notify(r.classified ? `AI đã phân loại ${r.classified} bài` : "AI chưa phân loại được bài nào — xem Nhật ký", !r.classified);
              })}>
              {busy === "classify" ? <Spinner /> : <Sparkles />} Phân loại lại
            </Button>
          </CardContent>
        </Card>
      )}
      {source === "apify" && info.data && (
        <p className="text-muted-foreground mb-3 text-xs">
          Nguồn: Apify · tháng {info.data.apify.usage.month.slice(5)}: {info.data.apify.usage.items} bài ≈ ${info.data.apify.usage.estUsd}
          {info.data.apify.budget > 0 && ` / ngân sách $${info.data.apify.budget}`}
          {lastScan && ` · quét gần nhất ${fmtTime(lastScan.at)}`}
          {!info.data.apify.hasToken && " · chưa có APIFY_TOKEN"}
        </p>
      )}
      {source === "scraper" && info.data && (() => {
        const r = info.data.scraper.last;
        const stale = !r || Date.now() - new Date(r.at).getTime() > info.data.scraper.intervalMinutes * 60_000 * 2.5;
        return (
          <Card className={`mb-4 py-4 ${r?.blocked || stale ? "border-warning/50 bg-warning/5" : ""}`}>
            <CardContent className="flex items-start gap-3 text-sm">
              {r?.blocked || stale ? <ShieldAlert className="text-warning size-5 shrink-0" /> : <Flame className="text-primary size-5 shrink-0" />}
              <div className="space-y-1">
                <p className="font-medium">Nguồn: Scraper trên máy bạn · {info.data.scraper.accounts} tài khoản nguồn</p>
                {!r ? (
                  <p className="text-muted-foreground">Chưa có lượt quét nào. Trên máy, mở terminal trong thư mục dự án và chạy <code className="bg-muted rounded px-1">npm run scraper</code>.</p>
                ) : (
                  <p className="text-muted-foreground">
                    Lượt gần nhất {fmtTime(r.at)}: {r.ok}/{r.accounts} tài khoản OK
                    {!!r.keywords && `, ${r.keywordsOk ?? 0}/${r.keywords} từ khoá`}, giữ {r.kept} bài ({r.newPosts} mới).
                    {r.searchNeedsLogin && " Tìm kiếm bị yêu cầu đăng nhập — chạy npm run scraper:login bằng acc phụ (hoặc chạy lại nếu cookie hết hạn). Lượt này chỉ đọc tài khoản nguồn."}
                    {r.blocked && " Có vẻ Threads đang giới hạn IP — scraper sẽ tự nghỉ lâu hơn rồi thử lại."}
                    {stale && !r.blocked && " Đã lâu không có lượt mới — kiểm tra scraper trên máy còn chạy không."}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}
      {lastScan?.skipped && source !== "manual" && lastScan.source === source && (
        <Card className="border-warning/50 bg-warning/5 mb-4 py-4">
          <CardContent className="flex items-start gap-3 text-sm">
            <ShieldAlert className="text-warning size-5 shrink-0" />
            <p>Lần quét {fmtTime(lastScan.at)} bị bỏ qua: {lastScan.skipped}</p>
          </CardContent>
        </Card>
      )}
      {source === "meta" && lastScan?.limited && (
        <Card className="border-warning/50 bg-warning/5 mb-4 py-4">
          <CardContent className="flex flex-col gap-3 text-sm md:flex-row md:items-start">
            <ShieldAlert className="text-warning size-5 shrink-0" />
            <div className="flex-1 space-y-1">
              <p className="font-medium">App chưa được duyệt quyền tìm kiếm bài công khai</p>
              <p className="text-muted-foreground">
                Lần quét {fmtTime(lastScan.at)}: {scanSummary(lastScan)} Khi quyền <code className="bg-muted rounded px-1">threads_keyword_search</code> chưa
                qua App Review, Threads chỉ cho tìm trong bài của chính bạn. Hãy chuyển nguồn quét sang <b>Apify</b> trong{" "}
                <Link href="/settings" className="underline">Cài đặt → Săn viral</Link>, hoặc dùng <b>Thêm thủ công</b>.
              </p>
            </div>
            <Button size="sm" onClick={() => { setManual({ url: "", text: "", username: "" }); setManualOpen(true); }}><Plus /> Thêm thủ công</Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <FilterChips<F> value={filter} onChange={setFilter} options={[["new", "Chưa dùng"], ["used", "Đã viết lại"], ["dismissed", "Đã bỏ qua"]]} />
        <div className="mb-4 flex items-center gap-2">
          <Checkbox id="tips" checked={onlyTips} onCheckedChange={(v) => setOnlyTips(v === true)} />
          <Label htmlFor="tips" className="text-muted-foreground font-normal">Chỉ bài AI xác nhận là tips</Label>
        </div>
      </div>

      {loading ? <ListSkeleton /> : !data?.length ? (
        <Card><CardContent><EmptyState icon={<Flame />}>{source === "manual" ? "Chưa có bài nào. Bấm “Thêm thủ công” để dán link bài viral bạn thấy, hoặc bật quét tự động qua Apify trong Cài đặt → Săn viral." : "Chưa có bài nào. Bấm “Quét ngay”, chờ lịch quét tự động, hoặc “Thêm thủ công” bài bạn tự tìm."}</EmptyState></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.map((p) => {
            const d = drafts[p.id];
            return (
              <Card key={p.id} className="gap-3">
                <CardContent className="space-y-3">
                  <div className="flex gap-3">
                    <ScoreBadge score={Number(p.score)} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="text-foreground text-sm font-semibold">@{p.username ?? "?"}</span>
                        <span>{fmtTime(p.posted_at ?? p.found_at)}</span>
                        <Badge variant="info">{p.keyword}</Badge>
                      </div>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {p.keyword === "Thủ công" ? <span>Bạn tự thêm</span> : p.id.startsWith("sc-") ? <span>Scraper · {p.keyword.startsWith("@") ? `từ ${p.keyword}` : `tìm “${p.keyword}”`}</span> : <>
                          <span title="Thứ hạng tốt nhất trong kết quả TOP">#{p.best_rank + 1} TOP</span>
                          <span title="Số lần xuất hiện qua các lần quét">{p.seen_count}× xuất hiện</span>
                        </>}
                        {!!(p.like_count || p.reply_count) ? <>
                          <span className="inline-flex items-center gap-1"><Heart className="size-3" /> {compact(p.like_count ?? 0)}</span>
                          <span className="inline-flex items-center gap-1"><MessageCircle className="size-3" /> {compact(p.reply_count ?? 0)}</span>
                          {!!p.repost_count && <span className="inline-flex items-center gap-1"><Repeat2 className="size-3" /> {compact(p.repost_count)}</span>}
                        </> : p.has_replies && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3" /> có thảo luận</span>}
                      </div>
                    </div>
                    {p.permalink && (
                      <Button asChild size="icon" variant="ghost" className="shrink-0" title="Mở bài gốc">
                        <a href={p.permalink} target="_blank" rel="noopener noreferrer"><ExternalLink /></a>
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {!p.ai_checked ? <Badge variant="secondary">Chờ AI phân loại</Badge> : p.is_tip
                      ? <Badge variant="success"><Check /> Tips · {p.ai_quality}/10</Badge>
                      : <Badge variant="destructive"><X /> Không phải tips</Badge>}
                    {p.ai_reason && <span className="text-muted-foreground">{p.ai_reason}</span>}
                  </div>

                  <p className="line-clamp-6 text-sm leading-relaxed whitespace-pre-wrap md:text-[15px]">{p.text}</p>

                  {affiliate && !!p.ai_product_keywords?.length && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground text-xs">Gợi ý sản phẩm:</span>
                      {p.ai_product_keywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}
                    </div>
                  )}

                  {d ? (
                    <div className="bg-muted/60 space-y-2 rounded-lg border border-dashed p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="warning">Nháp đã tạo</Badge>
                        {d.productId && (
                          <span className="text-muted-foreground inline-flex items-center gap-1"><ShoppingBag className="size-3" />{productName(d.productId)}</span>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{d.text}</p>
                      {d.productLine && <p className="text-muted-foreground text-xs">↳ {d.productLine} <i>[link]</i></p>}
                      <Button asChild size="sm" className="w-full md:w-auto"><Link href="/queue">Duyệt trong Hàng đợi <ArrowRight /></Link></Button>
                    </div>
                  ) : p.status === "new" ? (
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 md:flex-none" disabled={!status?.aiEnabled}
                        onClick={() => { setOpen(p); setProductId(products?.some((x) => x.active) ? "" : NO_PRODUCT); setExtra(""); }}>
                        <Sparkles /> Viết bài tương tự
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => setPostStatus(p.id, "dismissed")}>Bỏ qua</Button>
                    </div>
                  ) : p.status === "dismissed" ? (
                    <Button size="sm" variant="outline" onClick={() => setPostStatus(p.id, "new")}>Khôi phục</Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ResponsiveDialog open={manualOpen} onOpenChange={(o) => !o && busy !== "manual" && setManualOpen(false)} title="Thêm bài viral thủ công"
        description="Thấy bài mẹo hay đang nổi trên Threads? Dán link và/hoặc nội dung — AI sẽ phân loại, chấm điểm, rồi bạn bấm Viết bài tương tự."
        footer={
          <Button disabled={busy === "manual" || (!manual.url.trim() && !manual.text.trim())} onClick={() => run("manual", async () => {
            await api("/viral/manual", { method: "POST", body: manual });
            setManualOpen(false);
            if (filter !== "new") setFilter("new");
            await reload();
          }, "Đã thêm bài — AI đã phân loại")}>
            {busy === "manual" ? <><Spinner /> Đang phân tích…</> : <><Plus /> Thêm</>}
          </Button>
        }>
        <div className="grid gap-4 pb-2">
          <Field label="Link bài Threads" hint="Bấm ••• trên bài → Sao chép liên kết. Bot thử tự lấy nội dung; nếu không được, dán nội dung ở ô dưới.">
            <Input type="url" inputMode="url" value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} placeholder="https://www.threads.com/@ten/post/..." />
          </Field>
          <Field label="Nội dung bài (nên dán để chắc chắn)">
            <Textarea value={manual.text} onChange={(e) => setManual({ ...manual, text: e.target.value })} className="min-h-32" placeholder="Dán nội dung bài viral vào đây…" />
          </Field>
          <Field label="Username tác giả (tuỳ chọn)" hint="Tự lấy từ link nếu có.">
            <Input value={manual.username} onChange={(e) => setManual({ ...manual, username: e.target.value })} placeholder="ten_tac_gia" />
          </Field>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog open={!!open} onOpenChange={(o) => !o && !busy && setOpen(null)} title="Viết bài tương tự"
        description="AI viết lại hoàn toàn bằng giọng của bạn, không chép câu chữ bài gốc. Bài vào Hàng đợi dạng nháp để bạn duyệt."
        footer={
          <Button disabled={!!busy} onClick={() => open && run("draft", async () => {
            const noProduct = !affiliate || productId === NO_PRODUCT;
            const d = await api<Draft>(`/viral/${open.id}/draft`, {
              method: "POST", body: { productId: noProduct ? null : productId || null, noProduct, extra },
            });
            setDrafts((m) => ({ ...m, [open.id]: d }));
            setOpen(null);
          }, "Đã tạo nháp trong Hàng đợi")}>
            {busy === "draft" ? <><Spinner /> Đang viết…</> : <><Sparkles /> Viết</>}
          </Button>
        }>
        <div className="grid gap-4 pb-2">
          <blockquote className="text-muted-foreground max-h-40 overflow-y-auto border-l-2 pl-3 text-sm whitespace-pre-wrap">{open?.text}</blockquote>
          {affiliate && <ProductPicker products={products ?? []} value={productId} onChange={setProductId} allowAuto />}
          <Field label="Yêu cầu thêm cho AI (tuỳ chọn)">
            <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="VD: giọng hài hước, dạng danh sách 5 ý, cho mẹ bỉm…" />
          </Field>
        </div>
      </ResponsiveDialog>
    </>
  );
}
