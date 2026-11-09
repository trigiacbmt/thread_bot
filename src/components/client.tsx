"use client";
// Tiện ích phía client: gọi API, toast, trạng thái tài khoản, định dạng.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

// ---------- Định dạng ----------
export const fmtNum = (n?: number | null) =>
  n == null ? "–" : new Intl.NumberFormat("vi-VN", { notation: n >= 10000 ? "compact" : "standard" }).format(n);
export const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "";
/** Độ dài theo cách Threads tính: emoji = số byte UTF-8, ký tự khác = 1. */
const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
export const charLen = (s: string) => {
  let n = 0;
  for (const ch of s) n += /\p{Extended_Pictographic}|\u200d|\ufe0f/u.test(ch) ? (enc?.encode(ch).length ?? 4) : 1;
  return n;
};
export function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);

// ---------- API ----------
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch("/api" + path, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.reload(); }
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

/** Tải dữ liệu từ API, có reload và tự làm mới định kỳ (pollMs). */
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const h = setInterval(() => document.visibilityState === "visible" && void reload(), pollMs);
    return () => clearInterval(h);
  }, [reload, pollMs]);
  return { data, setData, error, loading, reload };
}

// ---------- Toast (sonner) ----------
type ToastFn = (msg: string, isErr?: boolean) => void;
export const useToast = (): ToastFn => useCallback((msg: string, isErr = false) => {
  if (isErr) toast.error(msg); else toast.success(msg);
}, []);

/** Chạy một thao tác: khoá nút, hiện toast thành công/lỗi. */
export function useAction() {
  const notify = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (okMsg) notify(okMsg);
        return r;
      } catch (e) {
        notify((e as Error).message, true);
      } finally {
        setBusy(null);
      }
    },
    [notify],
  );
  return { busy, run };
}

// ---------- Trạng thái tài khoản ----------
export interface Status {
  connected: boolean;
  username: string | null;
  tokenExpiresAt: string | null;
  aiEnabled: boolean;
  aiModel: string;
  maxText: number;
  shopeeEnabled: boolean;
  affiliateEnabled: boolean;
  publishingLimit: {
    quota_usage?: number; config?: { quota_total?: number };
    reply_quota_usage?: number; reply_config?: { quota_total?: number };
  } | null;
}
const StatusCtx = createContext<{ status: Status | null; reload: () => void }>({ status: null, reload: () => {} });
export const useStatus = () => useContext(StatusCtx);

export function Providers({ children }: { children: ReactNode }) {
  const { data: status, reload } = useApi<Status>("/status", 60_000);
  return (
    <StatusCtx.Provider value={{ status, reload }}>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </StatusCtx.Provider>
  );
}
