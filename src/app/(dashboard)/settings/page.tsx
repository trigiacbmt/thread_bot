"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bot, CircleCheck, CircleX, Clock, Flame, MessageCircle, RotateCcw, Save, Send, ShoppingBag, Sparkles, Trash2, X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { api, useAction, useApi, useStatus, useToast } from "@/components/client";
import { ConfirmButton, Field, ListSkeleton, PageHeader, Spinner } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isValidCron } from "@/lib/cronMatch";

type LinkMode = "reply" | "inline" | "none";
interface Settings {
  aiModel: string; aiClassifyModel: string; persona: string; writingGuide: string; timezone: string;
  voiceSummary: string; voiceSamples: string[]; useVoiceSamples: boolean;
  postTopics: string[]; postCron: string; autoPostEnabled: boolean; requireApproval: boolean; topicTag: string; replyControl: string;
  autoReply: boolean; maxRepliesPerHour: number;
  viralKeywords: string[]; viralCron: string; viralMaxAgeHours: number; viralSearchLimit: number;
  autoViralDrafts: boolean; viralDailyDrafts: number; minViralScore: number;
  viralSource: "apify" | "scraper" | "meta" | "manual"; apifyActor: string;
  viralSourceAccounts: string[]; scraperSearchKeywords: boolean; scraperIntervalMinutes: number; scraperMinLikes: number; scraperScrolls: number; apifyMaxPosts: number; apifyPricePer1k: number;
  apifyMonthlyBudget: number; apifyInputTemplate: string; viralMinLikes: number; viralMinReplies: number; viralMinReposts: number; viralVietnameseOnly: boolean;
  affiliateEnabled: boolean; linkMode: LinkMode; affiliateDisclosure: string; shopeeSubId: string;
}
interface ScanInfo { source: string; apify: { hasToken: boolean; usage: { month: string; runs: number; items: number; estUsd: number }; budget: number } }

/** Số lần cron chạy trong 1 ngày = (số phút khớp) × (số giờ khớp). Bỏ qua trường ngày/thứ — đủ để ước tính chi phí. */
function countField(field: string, min: number, max: number): number {
  const vals = new Set<number>();
  for (const part of field.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) return 0;
    const step = Number(m[2] ?? 1) || 1;
    let [lo, hi] = [min, max];
    if (m[1] !== "*") { const [a, b] = m[1].split("-").map(Number); lo = a; hi = b ?? (m[2] ? max : a); }
    for (let v = lo; v <= hi; v += step) vals.add(v);
  }
  return vals.size;
}
function runsPerDay(expr: string, _tz?: string) {
  if (!isValidCron(expr)) return 0;
  const [mi, h] = expr.trim().split(/\s+/);
  return countField(mi, 0, 59) * countField(h, 0, 23);
}
const usd = (v: number) => `$${v < 1 ? v.toFixed(2) : v.toFixed(1)}`;

function ScraperSection({ form, set }: { form: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const num = (v: string) => Math.max(0, Number(v) || 0);
  return (
    <Section title="Scraper trên máy bạn" desc={<>Đọc bài công khai mới của các tài khoản nguồn và tìm theo từ khoá, không cần quyền Meta, không tốn phí. Chạy <code className="bg-muted rounded px-1">npm run scraper</code> trên máy nhà (IP dân cư ít bị chặn hơn VPS).</>}>
      <Field label="Tài khoản nguồn" hint={`Username hoặc link profile, Enter để thêm · ${form.viralSourceAccounts.length}/100 · nên chọn 30–100 tài khoản chuyên đăng tips`}>
        <TagInput value={form.viralSourceAccounts} onChange={(v) => set("viralSourceAccounts", v)} placeholder="meovat.hangngay, @tips.cuocsong…" />
      </Field>
      <SwitchRow id="scraperSearch" title="Tìm thêm theo từ khoá" desc="Mở tab Hàng đầu (TOP) của trang tìm kiếm Threads cho từng từ khoá. Threads thường bắt đăng nhập để tìm: chạy npm run scraper:login và đăng nhập bằng acc PHỤ (không dùng acc bot). Chưa đăng nhập thì scraper tự bỏ qua phần này."
        checked={form.scraperSearchKeywords} onChange={(v) => set("scraperSearchKeywords", v)} />
      {form.scraperSearchKeywords && (
        <Field label="Từ khoá" hint={`Enter hoặc dấu phẩy để thêm · ${form.viralKeywords.length} từ khoá · mỗi từ khoá = 1 trang/lượt quét`}>
          <TagInput value={form.viralKeywords} onChange={(v) => set("viralKeywords", v)} placeholder="mẹo hay, mẹo vặt…" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quét mỗi (phút)" hint="30–1440"><Input type="number" inputMode="numeric" min={30} max={1440} value={form.scraperIntervalMinutes} onChange={(e) => set("scraperIntervalMinutes", num(e.target.value))} /></Field>
        <Field label="Like tối thiểu" hint="Bỏ bài ít tương tác"><Input type="number" inputMode="numeric" min={0} value={form.scraperMinLikes} onChange={(e) => set("scraperMinLikes", num(e.target.value))} /></Field>
      </div>
      <Field label="Số lần cuộn trang" hint="0–5 · cuộn nhiều = lấy được nhiều bài cũ hơn nhưng chậm hơn"><Input type="number" inputMode="numeric" min={0} max={5} value={form.scraperScrolls} onChange={(e) => set("scraperScrolls", num(e.target.value))} /></Field>
      <p className="text-muted-foreground text-xs">Mỗi trang (profile hoặc tìm kiếm) cách nhau 6–14 giây. Nếu 3 trang liên tiếp lỗi, scraper tự dừng lượt đó và nghỉ gấp đôi. Bot không đăng nhập Threads khi quét nên tài khoản của bạn không bị ảnh hưởng.</p>
    </Section>
  );
}

function ApifySection({ form, set, info }: {
  form: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void; info: ScanInfo | null;
}) {
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const perRunPosts = form.viralKeywords.length * form.apifyMaxPosts;
  const perDay = runsPerDay(form.viralCron, form.timezone);
  const monthUsd = (perRunPosts * perDay * 30 * form.apifyPricePer1k) / 1000;
  const used = info?.apify.usage;
  const overBudget = form.apifyMonthlyBudget > 0 && monthUsd > form.apifyMonthlyBudget;
  return (
    <Section title="Apify" desc={<>Dịch vụ scrape bài công khai, không cần Meta App Review và không dùng tài khoản Threads của bạn. Tính phí theo số bài lấy về.</>}>
      {info && !info.apify.hasToken && (
        <p className="border-warning/50 bg-warning/5 rounded-md border p-3 text-sm">
          Chưa có <code className="bg-muted rounded px-1">APIFY_TOKEN</code> trong <code className="bg-muted rounded px-1">.env.local</code>.
          Tạo tài khoản ở apify.com → Settings → API &amp; Integrations → copy Personal API token, rồi khởi động lại app.
        </p>
      )}
      <Field label="Actor" hint="Mặc định webdata_labs/threads-scraper (không thu phí mỗi lần chạy). Đổi actor khác thì điền thêm mẫu input bên dưới.">
        <Input value={form.apifyActor} onChange={(e) => set("apifyActor", e.target.value)} className="font-mono" placeholder="webdata_labs/threads-scraper" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Số bài mỗi từ khoá" hint="1–50 · Threads chỉ cho ~20 bài/từ khoá">
          <Input type="number" inputMode="numeric" min={1} max={50} value={form.apifyMaxPosts} onChange={(e) => set("apifyMaxPosts", num(e.target.value))} />
        </Field>
        <Field label="Giá actor (USD/1.000 bài)" hint="Xem trên trang actor">
          <Input type="number" inputMode="decimal" min={0} step="0.1" value={form.apifyPricePer1k} onChange={(e) => set("apifyPricePer1k", num(e.target.value))} />
        </Field>
      </div>
      <Field label="Ngân sách tháng (USD)" hint="Ước tính vượt mức này thì bot tự ngừng quét đến tháng sau. 0 = không giới hạn.">
        <Input type="number" inputMode="decimal" min={0} step="0.5" value={form.apifyMonthlyBudget} onChange={(e) => set("apifyMonthlyBudget", num(e.target.value))} />
      </Field>
      <div className="bg-muted/50 grid gap-1 rounded-md p-3 text-sm">
        <div className="flex justify-between gap-2"><span className="text-muted-foreground">Mỗi lần quét</span><span>{perRunPosts} bài ≈ {usd((perRunPosts * form.apifyPricePer1k) / 1000)}</span></div>
        <div className="flex justify-between gap-2"><span className="text-muted-foreground">Theo lịch ({perDay} lần/ngày)</span>
          <span className={overBudget ? "text-destructive font-medium" : ""}>≈ {usd(monthUsd)}/tháng</span></div>
        {used && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Đã dùng tháng {used.month.slice(5)}</span>
          <span>{used.items} bài · {used.runs} lần · ≈ {usd(used.estUsd)}</span></div>}
        {overBudget && <p className="text-destructive text-xs">Lịch hiện tại vượt ngân sách — bot sẽ dừng giữa tháng. Giảm số lần quét, số từ khoá hoặc số bài.</p>}
      </div>
      <Field label="Mẫu input JSON (nâng cao, tuỳ chọn)" hint="Chỉ cần khi đổi actor. Biến: {{keywords}} (mảng), {{maxPosts}}, {{postedAfter}} (ISO).">
        <Textarea value={form.apifyInputTemplate} onChange={(e) => set("apifyInputTemplate", e.target.value)} className="min-h-20 font-mono text-xs"
          placeholder={'{"mode":"search","searchQueries":{{keywords}},"maxPosts":{{maxPosts}},"postedAfter":"{{postedAfter}}"}'} />
      </Field>
    </Section>
  );
}

interface Meta { models: Array<{ id: string; label: string }>; defaults: Settings }

const CUSTOM = "__custom";
const TIMEZONES = [
  ["Asia/Ho_Chi_Minh", "Việt Nam (GMT+7)"], ["Asia/Bangkok", "Bangkok (GMT+7)"], ["Asia/Singapore", "Singapore (GMT+8)"],
  ["Asia/Tokyo", "Tokyo (GMT+9)"], ["Australia/Sydney", "Sydney"], ["Europe/London", "London"], ["America/New_York", "New York"],
  ["America/Los_Angeles", "Los Angeles"], ["UTC", "UTC"],
];
const REPLY_CONTROLS = [
  ["everyone", "Mọi người"], ["accounts_you_follow", "Người mình theo dõi"], ["followers_only", "Chỉ người theo dõi mình"],
  ["mentioned_only", "Chỉ người được nhắc tên"],
];

// ---------- Ô nhập dạng thẻ (chủ đề, từ khoá) ----------
function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (items.length) onChange([...new Set([...value, ...items])]);
    setDraft("");
  };
  return (
    <div className="bg-card focus-within:border-ring focus-within:ring-ring/50 flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border p-1.5 shadow-xs focus-within:ring-[3px]">
      {value.map((t) => (
        <Badge key={t} variant="secondary" className="h-7 gap-1 pr-1 pl-2.5 text-[13px] font-normal">
          {t}
          <button type="button" aria-label={`Xoá ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}
            className="hover:bg-muted-foreground/20 grid size-5 place-items-center rounded-sm"><X className="size-3" /></button>
        </Badge>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={value.length ? "Thêm…" : placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
          if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)} onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[,\n]/.test(text)) { e.preventDefault(); add(text); }
        }}
        enterKeyHint="done" className="placeholder:text-muted-foreground min-w-28 flex-1 bg-transparent px-1.5 text-base outline-none md:text-sm" />
    </div>
  );
}

// ---------- Chọn model AI (danh sách gợi ý + tự nhập) + nút kiểm tra ----------
function ModelPicker({ label, hint, value, onChange, models }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; models: Meta["models"];
}) {
  const known = models.some((m) => m.id === value);
  const [custom, setCustom] = useState(!known);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => setTest(null), [value]);

  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Select value={custom ? CUSTOM : value} onValueChange={(v) => {
          if (v === CUSTOM) { setCustom(true); return; }
          setCustom(false); onChange(v);
        }}>
          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            <SelectItem value={CUSTOM}>Tự nhập tên model…</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={testing || !value.trim()} onClick={async () => {
          setTesting(true);
          try {
            const r = await api<{ ms: number }>("/ai/test", { method: "POST", body: { model: value } });
            setTest({ ok: true, text: `Hoạt động · ${r.ms} ms` });
          } catch (e) {
            setTest({ ok: false, text: (e as Error).message.slice(0, 160) });
          } finally { setTesting(false); }
        }}>{testing ? <Spinner /> : <Send />}<span className="hidden sm:inline">Kiểm tra</span></Button>
      </div>
      {custom && <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="VD: claude-sonnet-5-5" className="font-mono" />}
      {test && (
        <p className={`flex items-start gap-1.5 text-xs ${test.ok ? "text-success" : "text-destructive"}`}>
          {test.ok ? <CircleCheck className="mt-px size-3.5 shrink-0" /> : <CircleX className="mt-px size-3.5 shrink-0" />}
          <span className="break-all">{test.text}</span>
        </p>
      )}
    </Field>
  );
}

// ---------- Giọng văn: phân tích từ bài đã đăng ----------
interface VoiceAnalysis { summary: string; traits: string[]; persona: string; writingGuide: string; samples: string[]; analyzed: number }

function VoiceSection({ form, set, setMany, connected, aiEnabled }: {
  form: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void; setMany: (p: Partial<Settings>) => void;
  connected: boolean; aiEnabled: boolean;
}) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VoiceAnalysis | null>(null);
  const [pick, setPick] = useState({ summary: true, persona: true, guide: true, samples: [] as number[] });

  const analyze = async () => {
    setBusy(true);
    try {
      const r = await api<VoiceAnalysis>("/ai/voice", { method: "POST" });
      setResult(r);
      setPick({ summary: true, persona: true, guide: true, samples: r.samples.map((_, i) => i) });
    } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="size-4" /> Giọng văn của bạn</CardTitle>
        <CardDescription>AI đọc các bài và reply bạn đã đăng để viết giống bạn. Bài mẫu được đưa vào mọi lần AI viết (viết lại viral, viết theo chủ đề, trả lời).</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={analyze} disabled={busy || !connected || !aiEnabled}>{busy ? <><Spinner /> Đang đọc bài của bạn…</> : <><Sparkles /> Phân tích từ bài đã đăng</>}</Button>
          <span className="text-muted-foreground text-xs">{!connected ? "Cần kết nối tài khoản Threads trước." : "Đọc tối đa 50 bài + 30 reply gần nhất, bỏ qua bài do bot đăng."}</span>
        </div>

        <Field label="Tóm tắt phong cách" hint="Có thể tự sửa. Để trống nếu không muốn dùng.">
          <Textarea value={form.voiceSummary} onChange={(e) => set("voiceSummary", e.target.value)} className="min-h-24"
            placeholder="Chưa phân tích. Bấm nút phía trên hoặc tự mô tả cách bạn hay viết." />
        </Field>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label>Bài mẫu ({form.voiceSamples.length}/5)</Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="useSamples" className="text-muted-foreground text-xs font-normal">Dùng bài mẫu</Label>
              <Switch id="useSamples" checked={form.useVoiceSamples} onCheckedChange={(v) => set("useVoiceSamples", v)} />
            </div>
          </div>
          {form.voiceSamples.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {form.voiceSamples.map((t, i) => (
                <div key={i} className="bg-muted/50 relative rounded-lg border p-3 pr-10 text-sm whitespace-pre-wrap">
                  <p className="line-clamp-5">{t}</p>
                  <Button size="icon" variant="ghost" className="absolute top-1 right-1 size-8" aria-label="Bỏ bài mẫu"
                    onClick={() => set("voiceSamples", form.voiceSamples.filter((_, j) => j !== i))}><Trash2 /></Button>
                </div>
              ))}
            </div>
          ) : <p className="text-muted-foreground text-xs">Chưa có bài mẫu.</p>}
        </div>
      </CardContent>

      <ResponsiveDialog open={!!result} onOpenChange={(o) => !o && setResult(null)} title="Kết quả phân tích giọng văn"
        description={result ? `Đã đọc ${result.analyzed} bài/reply. Chọn phần muốn áp dụng — sau đó bấm Lưu.` : undefined}
        footer={<Button onClick={() => {
          if (!result) return;
          setMany({
            ...(pick.summary ? { voiceSummary: result.summary } : {}),
            ...(pick.persona && result.persona ? { persona: result.persona } : {}),
            ...(pick.guide && result.writingGuide ? { writingGuide: result.writingGuide } : {}),
            ...(pick.samples.length ? { voiceSamples: pick.samples.map((i) => result.samples[i]) } : {}),
          });
          setResult(null);
          notify("Đã áp dụng — nhớ bấm Lưu");
        }}>Áp dụng</Button>}>
        {result && (
          <div className="grid gap-4 pb-2 text-sm">
            <div className="flex flex-wrap gap-1.5">{result.traits.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
            {([
              ["summary", "Tóm tắt phong cách", result.summary],
              ["persona", "Persona đề xuất (thay persona hiện tại)", result.persona],
              ["guide", "Hướng dẫn viết đề xuất (thay hướng dẫn hiện tại)", result.writingGuide],
            ] as const).filter(([, , v]) => v).map(([k, label, v]) => (
              <label key={k} className="flex cursor-pointer gap-3 rounded-lg border p-3">
                <Checkbox checked={pick[k]} onCheckedChange={(c) => setPick((p) => ({ ...p, [k]: c === true }))} className="mt-0.5" />
                <div className="min-w-0"><div className="mb-1 font-medium">{label}</div><p className="text-muted-foreground whitespace-pre-wrap">{v}</p></div>
              </label>
            ))}
            <div className="grid gap-2">
              <div className="font-medium">Bài mẫu tiêu biểu</div>
              {result.samples.map((t, i) => (
                <label key={i} className="flex cursor-pointer gap-3 rounded-lg border p-3">
                  <Checkbox checked={pick.samples.includes(i)} className="mt-0.5"
                    onCheckedChange={(c) => setPick((p) => ({ ...p, samples: c === true ? [...p.samples, i].sort() : p.samples.filter((x) => x !== i) }))} />
                  <p className="text-muted-foreground line-clamp-4 whitespace-pre-wrap">{t}</p>
                </label>
              ))}
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </Card>
  );
}

function SwitchRow({ id, title, desc, checked, onChange }: { id: string; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="space-y-0.5"><Label htmlFor={id}>{title}</Label><p className="text-muted-foreground text-xs">{desc}</p></div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{desc && <CardDescription>{desc}</CardDescription>}</CardHeader>
      <CardContent className="grid min-w-0 grid-cols-1 gap-4">{children}</CardContent>
    </Card>
  );
}

const SimpleSelect = ({ value, onChange, options, disabled }: {
  value: string; onChange: (v: string) => void; options: string[][]; disabled?: boolean;
}) => (
  <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      {!options.some(([v]) => v === value) && <SelectItem value={value}>{value}</SelectItem>}
      {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
    </SelectContent>
  </Select>
);

export default function SettingsPage() {
  const { data, setData, loading } = useApi<Settings>("/settings");
  const { data: meta } = useApi<Meta>("/settings/meta");
  const { data: scanInfo } = useApi<ScanInfo>("/viral/last-scan");
  const { busy, run } = useAction();
  const { status, reload: reloadStatus } = useStatus();
  const [form, setForm] = useState<Settings | null>(null);
  const [tab, setTab] = useState("ai");
  useEffect(() => { if (data) setForm(data); }, [data]);
  const dirty = useMemo(() => !!data && !!form && JSON.stringify(form) !== JSON.stringify(data), [data, form]);

  if (loading || !form || !meta) return <ListSkeleton rows={4} />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });
  const setMany = (p: Partial<Settings>) => setForm({ ...form, ...p });
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const save = (body: Settings) => run("save", async () => {
    setData(await api<Settings>("/settings", { method: "PUT", body }));
    reloadStatus(); // cập nhật model AI trên header, ẩn/hiện tab Sản phẩm
  }, "Đã lưu cài đặt");

  return (
    <>
      <PageHeader title="Cài đặt" description="Mọi thứ ở đây có hiệu lực từ phút kế tiếp, không cần deploy lại. File .env chỉ còn chứa key và kết nối." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ai"><Bot /> AI</TabsTrigger>
          <TabsTrigger value="viral"><Flame /> Săn viral</TabsTrigger>
          <TabsTrigger value="post"><Send /> Đăng bài</TabsTrigger>
          <TabsTrigger value="reply"><MessageCircle /> Trả lời</TabsTrigger>
          <TabsTrigger value="shop"><ShoppingBag /> Sản phẩm</TabsTrigger>
          <TabsTrigger value="general"><Clock /> Chung</TabsTrigger>
        </TabsList>

        {/* ---------- AI ---------- */}
        <TabsContent value="ai" className="grid gap-4 md:grid-cols-2">
          <Section title="Model" desc="Bấm Kiểm tra để thử ngay với API key hiện tại (chưa cần lưu).">
            <ModelPicker label="Model viết bài & trả lời" value={form.aiModel} onChange={(v) => set("aiModel", v)} models={meta.models}
              hint="Dùng khi viết lại bài viral, viết theo chủ đề và trả lời bình luận." />
            <ModelPicker label="Model phân loại bài viral" value={form.aiClassifyModel} onChange={(v) => set("aiClassifyModel", v)} models={meta.models}
              hint="Chạy nhiều lần mỗi ngày — nên dùng model nhanh, rẻ." />
          </Section>
          <Section title="Giọng văn">
            <Field label="Persona (AI đóng vai ai, nói chuyện thế nào)">
              <Textarea value={form.persona} onChange={(e) => set("persona", e.target.value)} className="min-h-28" />
            </Field>
            <Field label="Hướng dẫn viết thêm (tuỳ chọn)" hint="Áp dụng cho mọi bài AI viết và mọi câu trả lời.">
              <Textarea value={form.writingGuide} onChange={(e) => set("writingGuide", e.target.value)} className="min-h-24"
                placeholder={"VD:\n- Luôn kết bài bằng 1 câu hỏi để mọi người bình luận\n- Không dùng quá 2 emoji\n- Tránh từ 'siêu', 'cực kỳ'"} />
            </Field>
          </Section>
          <VoiceSection form={form} set={set} setMany={setMany} connected={!!status?.connected} aiEnabled={!!status?.aiEnabled} />
        </TabsContent>

        {/* ---------- Săn viral ---------- */}
        <TabsContent value="viral" className="grid gap-4 md:grid-cols-2">
          <Section title="Nguồn quét" desc="Meta chỉ cho tìm bài công khai khi app đã qua App Review (cần xác minh doanh nghiệp).">
            <Field label="Lấy bài viral từ">
              <SimpleSelect value={form.viralSource} onChange={(v) => set("viralSource", v as Settings["viralSource"])} options={[
                ["apify", "Apify — scrape bài công khai (tốn phí nhỏ)"],
                ["scraper", "Scraper trên máy bạn — miễn phí, theo dõi tài khoản nguồn"],
                ["meta", "Threads API chính thức (cần App Review)"],
                ["manual", "Chỉ thêm thủ công (tắt quét tự động)"],
              ]} />
            </Field>
            {form.viralSource !== "manual" && (
              <SwitchRow id="vnOnly" title="Chỉ bài tiếng Việt" desc="Bỏ bài tiếng Anh, Thái, Trung… (tự nhận diện theo dấu tiếng Việt)"
                checked={form.viralVietnameseOnly} onChange={(v) => set("viralVietnameseOnly", v)} />
            )}
            {(form.viralSource === "apify" || form.viralSource === "scraper") && (
              <Field label="Ngưỡng viral (phải đạt cả 3)" hint="Bài thiếu một trong ba sẽ bị bỏ. Gợi ý: 200 like · 20 bình luận · 5 chia sẻ.">
                <div className="grid grid-cols-3 gap-2">
                  {([["viralMinLikes", "♥ Like"], ["viralMinReplies", "💬 Bình luận"], ["viralMinReposts", "🔁 Chia sẻ"]] as const).map(([k, l]) => (
                    <label key={k} className="grid gap-1 text-xs">
                      <span className="text-muted-foreground">{l}</span>
                      <Input type="number" inputMode="numeric" min={0} value={form[k]} onChange={(e) => set(k, num(e.target.value))} />
                    </label>
                  ))}
                </div>
              </Field>
            )}
            {form.viralSource === "scraper" && <Field label="Chỉ lấy bài trong (giờ)" hint="1–168 giờ"><Input type="number" inputMode="numeric" min={1} max={168} value={form.viralMaxAgeHours} onChange={(e) => set("viralMaxAgeHours", num(e.target.value))} /></Field>}
            {form.viralSource !== "manual" && form.viralSource !== "scraper" && <>
              <Field label="Từ khoá" hint={form.viralSource === "apify"
                ? `Enter hoặc dấu phẩy để thêm · ${form.viralKeywords.length} từ khoá`
                : `Enter hoặc dấu phẩy để thêm · ${form.viralKeywords.length} từ khoá ≈ ${form.viralKeywords.length * runsPerDay(form.viralCron, form.timezone)} lượt/ngày (Threads giới hạn 2.200 lượt/24h)`}>
                <TagInput value={form.viralKeywords} onChange={(v) => set("viralKeywords", v)} placeholder="mẹo hay, mẹo vặt…" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lịch quét (cron)" hint="15 */6 * * * = mỗi 6 giờ"><Input value={form.viralCron} onChange={(e) => set("viralCron", e.target.value)} className="font-mono" /></Field>
                {form.viralSource === "meta"
                  ? <Field label="Số bài mỗi từ khoá" hint="5–100"><Input type="number" inputMode="numeric" min={5} max={100} value={form.viralSearchLimit} onChange={(e) => set("viralSearchLimit", num(e.target.value))} /></Field>
                  : <Field label="Chỉ lấy bài trong (giờ)" hint="1–168 giờ"><Input type="number" inputMode="numeric" min={1} max={168} value={form.viralMaxAgeHours} onChange={(e) => set("viralMaxAgeHours", num(e.target.value))} /></Field>}
              </div>
              {form.viralSource === "meta" && <Field label="Chỉ lấy bài đăng trong (giờ)" hint="1–168 giờ"><Input type="number" inputMode="numeric" min={1} max={168} value={form.viralMaxAgeHours} onChange={(e) => set("viralMaxAgeHours", num(e.target.value))} /></Field>}
            </>}
          </Section>
          {form.viralSource === "apify" && <ApifySection form={form} set={set} info={scanInfo} />}
          {form.viralSource === "scraper" && <ScraperSection form={form} set={set} />}
          <Section title="Tự viết nháp">
            <SwitchRow id="autoViral" title="Tự viết nháp từ bài viral" desc="AI tự viết lại các bài điểm cao nhất, bạn chỉ cần duyệt"
              checked={form.autoViralDrafts} onChange={(v) => set("autoViralDrafts", v)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tối đa nháp / ngày"><Input type="number" inputMode="numeric" min={0} value={form.viralDailyDrafts} disabled={!form.autoViralDrafts} onChange={(e) => set("viralDailyDrafts", num(e.target.value))} /></Field>
              <Field label="Điểm viral tối thiểu"><Input type="number" inputMode="numeric" min={0} value={form.minViralScore} disabled={!form.autoViralDrafts} onChange={(e) => set("minViralScore", num(e.target.value))} /></Field>
            </div>
          </Section>
        </TabsContent>

        {/* ---------- Đăng bài ---------- */}
        <TabsContent value="post" className="grid gap-4 md:grid-cols-2">
          <Section title="Áp dụng cho mọi bài đăng">
            <Field label="Topic tag (tuỳ chọn)" hint="Chủ đề Threads gắn vào bài, 1–50 ký tự, không chứa . hoặc &. VD: Mẹo vặt">
              <Input value={form.topicTag} onChange={(e) => set("topicTag", e.target.value)} placeholder="Mẹo vặt" />
            </Field>
            <Field label="Ai được reply bài của bạn">
              <SimpleSelect value={form.replyControl} onChange={(v) => set("replyControl", v)} options={REPLY_CONTROLS} />
            </Field>
            <SwitchRow id="approval" title="Duyệt trước khi đăng" desc="Bài AI viết theo chủ đề vào Hàng đợi dạng nháp (bài từ viral luôn là nháp)"
              checked={form.requireApproval} onChange={(v) => set("requireApproval", v)} />
          </Section>
          <Section title="Tự đăng theo chủ đề" desc="AI viết bài mới theo danh sách chủ đề, xoay vòng.">
            <SwitchRow id="autoPost" title="Bật" desc="Tắt nếu bạn chỉ dùng tính năng săn viral" checked={form.autoPostEnabled} onChange={(v) => set("autoPostEnabled", v)} />
            <Field label="Chủ đề" hint="Enter hoặc dấu phẩy để thêm">
              <TagInput value={form.postTopics} onChange={(v) => set("postTopics", v)} placeholder="Mẹo nhà bếp, Mẹo dọn dẹp…" />
            </Field>
            <Field label="Lịch tạo bài (cron)" hint="0 9,20 * * * = 9h và 20h mỗi ngày">
              <Input value={form.postCron} onChange={(e) => set("postCron", e.target.value)} className="font-mono" disabled={!form.autoPostEnabled} />
            </Field>
          </Section>
        </TabsContent>

        {/* ---------- Trả lời ---------- */}
        <TabsContent value="reply" className="grid gap-4 md:grid-cols-2">
          <Section title="Tự trả lời reply & mention">
            <SwitchRow id="autoReply" title="Bật" desc="AI trả lời có ngữ cảnh, tự bỏ qua spam, không tự trả lời chính mình" checked={form.autoReply} onChange={(v) => set("autoReply", v)} />
            <Field label="Tối đa reply / giờ" hint="Chống bị Threads coi là spam"><Input type="number" inputMode="numeric" min={0} value={form.maxRepliesPerHour} onChange={(e) => set("maxRepliesPerHour", num(e.target.value))} /></Field>
          </Section>
        </TabsContent>

        {/* ---------- Sản phẩm ---------- */}
        <TabsContent value="shop" className="grid gap-4 md:grid-cols-2">
          <Section title="Link sản phẩm Shopee (tuỳ chọn)">
            <SwitchRow id="affiliate" title="Gắn link sản phẩm" desc="Tắt: bot chỉ săn viral và viết lại bài, ẩn tab Sản phẩm"
              checked={form.affiliateEnabled} onChange={(v) => set("affiliateEnabled", v)} />
            <Field label="Cách gắn link mặc định">
              <SimpleSelect value={form.linkMode} disabled={!form.affiliateEnabled} onChange={(v) => set("linkMode", v as LinkMode)} options={[
                ["reply", "Link ở reply đầu tiên"], ["inline", "Link ở cuối bài (kèm thẻ xem trước)"], ["none", "Không gắn link"]]} />
            </Field>
            <Field label="Ghi chú tiếp thị liên kết" hint="Thêm dưới link. Để trống nếu không cần.">
              <Input value={form.affiliateDisclosure} disabled={!form.affiliateEnabled} onChange={(e) => set("affiliateDisclosure", e.target.value)} />
            </Field>
            <Field label="Shopee subId" hint="Gắn vào link tự tạo qua Shopee Affiliate API, để xem đơn theo kênh trong báo cáo Shopee.">
              <Input value={form.shopeeSubId} disabled={!form.affiliateEnabled} onChange={(e) => set("shopeeSubId", e.target.value)} className="font-mono" />
            </Field>
          </Section>
        </TabsContent>

        {/* ---------- Chung ---------- */}
        <TabsContent value="general" className="grid gap-4 md:grid-cols-2">
          <Section title="Thời gian" desc="Các lịch cron và giới hạn theo ngày tính theo múi giờ này.">
            <Field label="Múi giờ"><SimpleSelect value={form.timezone} onChange={(v) => set("timezone", v)} options={TIMEZONES} /></Field>
          </Section>
          <Section title="Khôi phục" desc="Đưa toàn bộ cài đặt về mặc định (không ảnh hưởng hàng đợi, sản phẩm, dữ liệu).">
            <ConfirmButton label={<><RotateCcw /> Khôi phục mặc định</>} confirmLabel="Bấm lần nữa để khôi phục" className="w-fit"
              disabled={!!busy} onConfirm={() => { setForm(meta.defaults); save(meta.defaults); }} />
          </Section>
        </TabsContent>
      </Tabs>

      {/* Thanh lưu: dính đáy (trên thanh tab điện thoại), luôn thấy khi có thay đổi */}
      <div className="bg-background/90 sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-4 flex items-center justify-end gap-3 border-t px-4 py-3 backdrop-blur-md md:bottom-0 md:mx-0 md:rounded-xl md:border md:px-4">
        <span className="text-muted-foreground mr-auto text-xs">{dirty ? "Có thay đổi chưa lưu" : "Đã lưu"}</span>
        {dirty && <Button variant="ghost" onClick={() => data && setForm(data)}>Huỷ</Button>}
        <Button disabled={!!busy || !dirty} onClick={() => save(form)}>{busy ? <Spinner /> : <Save />} Lưu</Button>
      </div>
    </>
  );
}
