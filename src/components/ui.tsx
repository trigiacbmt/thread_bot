"use client";
// Component nghiệp vụ dùng chung, dựng trên shadcn/ui.
import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { charLen, fmtTime, fromLocalInput, toLocalInput, useStatus } from "./client";

// ---------- Nhãn ----------
type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";

export const TYPE_VI: Record<string, [string, BadgeVariant]> = {
  post: ["Đăng bài", "success"], reply: ["Reply", "success"], mention: ["Mention", "info"], skip: ["Bỏ qua", "secondary"],
  error: ["Lỗi", "destructive"], auth: ["Tài khoản", "secondary"], watch: ["Săn viral", "info"], info: ["Thông tin", "secondary"],
};
export const STATUS_VI: Record<string, [string, BadgeVariant]> = {
  draft: ["Nháp", "warning"], scheduled: ["Đã lên lịch", "info"], publishing: ["Đang đăng", "info"],
  posted: ["Đã đăng", "success"], failed: ["Lỗi", "destructive"],
};
export const LINK_MODE_VI: Record<string, string> = {
  reply: "Link ở reply đầu",
  inline: "Link trong bài",
  none: "Không gắn link",
};

export const Spinner = ({ className }: { className?: string }) => <LoaderCircle className={cn("size-4 animate-spin", className)} />;

// ---------- Bố cục ----------
export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:mb-6 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 gap-2 *:flex-1 md:*:flex-none">{children}</div>}
    </div>
  );
}

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-10 text-center text-sm">
      {icon && <div className="bg-muted text-muted-foreground mb-1 grid size-12 place-items-center rounded-full [&_svg]:size-6">{icon}</div>}
      {children}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i}><CardContent className="space-y-3"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent></Card>
      ))}
    </div>
  );
}

/** Bộ lọc dạng chip (luôn có một giá trị được chọn). */
export function FilterChips<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: Array<[T, ReactNode]>; className?: string;
}) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as T)} className={cn("mb-4", className)}>
      {options.map(([v, label]) => <ToggleGroupItem key={v} value={v}>{label}</ToggleGroupItem>)}
    </ToggleGroup>
  );
}

// ---------- Trường nhập ----------
export function Field({ label, htmlFor, hint, children, className }: {
  label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-muted-foreground text-xs font-normal md:text-[13px]">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function Counter({ text }: { text: string }) {
  const max = useStatus().status?.maxText ?? 500;
  const n = charLen(text);
  return <div className={cn("text-right text-xs tabular-nums", n > max ? "text-destructive font-medium" : "text-muted-foreground")}>{n} / {max}</div>;
}

/** Nút cần bấm 2 lần để xác nhận (thay cho hộp thoại confirm). */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled, className }: {
  label: ReactNode; confirmLabel: string; onConfirm: () => void; disabled?: boolean; className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const h = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(h);
  }, [armed]);
  return (
    <Button size="sm" variant={armed ? "destructive" : "ghost"} disabled={disabled}
      className={cn(!armed && "text-destructive hover:text-destructive", className)}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : label}
    </Button>
  );
}

// ---------- Nhật ký ----------
export interface ActivityRow {
  id: number; at: string; type: string; message: string; data?: Record<string, unknown> | null;
}

export function ActivityItem({ a, actions }: { a: ActivityRow; actions?: ReactNode }) {
  const err = a.data && typeof a.data.error === "string" ? a.data.error : null;
  const [label, variant] = TYPE_VI[a.type] ?? [a.type, "secondary"];
  return (
    <div className="border-b py-3 last:border-0">
      <div className="text-muted-foreground flex items-center gap-2 text-xs"><Badge variant={variant}>{label}</Badge>{fmtTime(a.at)}</div>
      <p className="mt-1.5 text-sm break-words whitespace-pre-wrap">{a.message}</p>
      {err && <p className="text-destructive mt-1 text-xs break-words">{err}</p>}
      {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Sản phẩm ----------
export interface ProductOption { id: string; name: string; affiliateUrl: string; price?: string | null; active: boolean }
/** Giá trị đặc biệt: người dùng chọn "Không gắn sản phẩm" (chỉ dùng khi allowAuto). */
export const NO_PRODUCT = "none";
const AUTO = "__auto";
const NONE = "__none";

/**
 * Chọn sản phẩm + cách gắn link.
 * - allowAuto: "" = để AI tự chọn, NO_PRODUCT = không gắn, còn lại = id sản phẩm.
 * - không allowAuto: "" = không gắn, còn lại = id sản phẩm.
 */
export function ProductPicker({ products, value, onChange, allowAuto, linkMode, onLinkMode }: {
  products: ProductOption[]; value: string; onChange: (v: string) => void; allowAuto?: boolean;
  linkMode?: string; onLinkMode?: (v: "reply" | "inline" | "none") => void;
}) {
  const selected = value === NO_PRODUCT ? NONE : value || (allowAuto ? AUTO : NONE);
  const hasProduct = !!value && value !== NO_PRODUCT;
  const active = products.filter((p) => p.active || p.id === value);
  return (
    <div className={cn("grid gap-4", onLinkMode && "md:grid-cols-2")}>
      <Field label="Sản phẩm Shopee (tuỳ chọn)"
        hint={allowAuto && !active.length ? "Kho đang trống nên bài sẽ không gắn link. Có thể thêm sản phẩm sau." : undefined}>
        <Select value={selected} onValueChange={(v) => onChange(v === AUTO ? "" : v === NONE ? (allowAuto ? NO_PRODUCT : "") : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {allowAuto && <SelectItem value={AUTO} disabled={!active.length}>✨ Để AI tự chọn phù hợp nhất</SelectItem>}
            <SelectItem value={NONE}>Không gắn sản phẩm</SelectItem>
            {active.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}{p.price ? ` · ${p.price}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {onLinkMode && (
        <Field label="Cách gắn link">
          <Select value={linkMode} onValueChange={(v) => onLinkMode(v as "reply" | "inline" | "none")} disabled={!hasProduct}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(LINK_MODE_VI).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
    </div>
  );
}

// ---------- Hộp soạn văn bản ----------
/** Sửa bài / trả lời một bài: Dialog trên máy tính, Drawer trên điện thoại. */
export function TextDialog({ open, title, initialText = "", initialAt, withSchedule, saveLabel = "Lưu", onAi, onSave, onClose }: {
  open: boolean; title: string; initialText?: string; initialAt?: string | null; withSchedule?: boolean; saveLabel?: string;
  onAi?: () => Promise<string | null | undefined>;
  onSave: (text: string, at?: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [at, setAt] = useState(toLocalInput(initialAt));
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);
  const max = useStatus().status?.maxText ?? 500;
  useEffect(() => {
    if (open) { setText(initialText); setAt(toLocalInput(initialAt)); }
  }, [open, initialText, initialAt]);
  const tooLong = charLen(text) > max;

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()} title={title}
      footer={<>
        {onAi && (
          <Button variant="outline" disabled={!!busy} onClick={async () => {
            setBusy("ai");
            try { setText((await onAi()) ?? "(AI đề xuất không nên trả lời bình luận này)"); } finally { setBusy(null); }
          }}>{busy === "ai" ? <Spinner /> : <Sparkles />} AI gợi ý</Button>
        )}
        <Button disabled={!!busy || !text.trim() || tooLong} onClick={async () => {
          setBusy("save");
          try { await onSave(text.trim(), fromLocalInput(at)); onClose(); } finally { setBusy(null); }
        }}>{busy === "save" && <Spinner />} {saveLabel}</Button>
      </>}>
      <div className="grid gap-4 pb-2">
        <div className="grid gap-1.5">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40" />
          <Counter text={text} />
        </div>
        {withSchedule && (
          <Field label="Lên lịch (để trống = đăng ở phút kế tiếp)">
            <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
        )}
      </div>
    </ResponsiveDialog>
  );
}

export { fmtTime };
