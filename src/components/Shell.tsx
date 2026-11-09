"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  ChartColumn, Ellipsis, Flame, House, ListChecks, LogOut, MessageCircle, PenLine, ScrollText, Settings, ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { api, useApi, useStatus, useToast } from "./client";

const NAV: Array<{ href: string; label: string; short: string; icon: LucideIcon; primary?: boolean }> = [
  { href: "/", label: "Tổng quan", short: "Tổng quan", icon: House, primary: true },
  { href: "/viral", label: "Săn viral", short: "Viral", icon: Flame, primary: true },
  { href: "/queue", label: "Hàng đợi", short: "Hàng đợi", icon: ListChecks, primary: true },
  { href: "/products", label: "Sản phẩm", short: "Sản phẩm", icon: ShoppingBag, primary: true },
  { href: "/compose", label: "Soạn bài", short: "Soạn bài", icon: PenLine, primary: true },
  { href: "/engage", label: "Tương tác", short: "Tương tác", icon: MessageCircle },
  { href: "/insights", label: "Insights", short: "Insights", icon: ChartColumn },
  { href: "/settings", label: "Cài đặt", short: "Cài đặt", icon: Settings },
  { href: "/logs", label: "Nhật ký", short: "Nhật ký", icon: ScrollText },
];

/** Hiện thông báo sau khi OAuth quay về (?connected=1 / ?oauth_error=...). */
function OAuthNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const notify = useToast();
  const { reload } = useStatus();
  useEffect(() => {
    if (params.get("connected")) { notify("Đã đăng nhập và kết nối bot với tài khoản Threads"); reload(); router.replace("/"); }
    if (params.get("logged_in")) { notify("Đã đăng nhập"); router.replace("/"); }
    const err = params.get("login_error");
    if (err) { notify(err, true); router.replace("/"); }
  }, [params, router, notify, reload]);
  return null;
}

const logout = async () => { await api("/login", { method: "DELETE" }); location.href = "/"; };

function StatusDot({ ok }: { ok?: boolean }) {
  return <span className={cn("size-2 shrink-0 rounded-full", ok === undefined ? "bg-muted-foreground/40" : ok ? "bg-success" : "bg-destructive")} />;
}

interface SessionUser { id: string; username: string; via: "threads" | "admin-key" }

export function Shell({ children, user }: { children: ReactNode; user: SessionUser }) {
  const path = usePathname();
  const { status } = useStatus();
  const { data: queue } = useApi<Array<{ status: string }>>("/queue", 60_000);
  const drafts = queue?.filter((q) => q.status === "draft").length ?? 0;
  const [moreOpen, setMoreOpen] = useState(false);
  // Tab dưới đáy: 4 mục chính. Khi tắt sản phẩm, "Soạn bài" thay chỗ "Sản phẩm" (Sản phẩm vào menu Thêm).
  const affiliate = status?.affiliateEnabled ?? true;
  const primary = NAV.filter((n) => n.primary && n.href !== (affiliate ? "/compose" : "/products"));
  const rest = NAV.filter((n) => !primary.includes(n));
  const moreActive = rest.some((n) => n.href === path);
  useEffect(() => setMoreOpen(false), [path]);

  return (
    <div className="min-h-dvh">
      <Suspense><OAuthNotice /></Suspense>

      <header className="bg-background/85 pt-safe sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:h-16 md:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-base font-bold">@</span>
            <span>Threads Bot</span>
          </Link>
          <div className="flex-1" />
          <Badge variant="outline" className="hidden h-7 gap-1.5 rounded-full px-2.5 font-normal md:inline-flex" title={status?.aiModel}>
            <StatusDot ok={status ? status.aiEnabled : undefined} /> AI {status ? (status.aiEnabled ? status.aiModel : "chưa bật") : ""}
          </Badge>
          <Badge variant="outline" className="h-7 max-w-[45vw] gap-1.5 rounded-full px-2.5 font-normal">
            <StatusDot ok={status ? status.connected : undefined} />
            <span className="truncate">{status?.connected ? `@${status.username}` : "Chưa kết nối"}</span>
          </Badge>
          <Button asChild size="sm" variant={status?.connected ? "outline" : "default"} className={cn(status?.connected && "hidden md:inline-flex")}>
            {/* Route handler OAuth → dùng <a> để điều hướng toàn trang */}
            <a href="/auth/login?mode=connect">{status?.connected ? "Kết nối lại" : "Kết nối bot"}</a>
          </Button>
          <Button size="sm" variant="ghost" className="hidden md:inline-flex" onClick={logout} title={`Đăng nhập: ${user.via === "threads" ? "@" + user.username : "admin key"}`}>
            <LogOut /> Thoát
          </Button>
        </div>

        {/* Máy tính: tab ngang */}
        <nav className="scrollbar-none mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 md:flex md:px-6">
          {NAV.filter((n) => affiliate || n.href !== "/products").map((n) => (
            <Link key={n.href} href={n.href}
              className={cn("relative flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                path === n.href ? "text-foreground font-medium after:bg-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full"
                  : "text-muted-foreground hover:text-foreground")}>
              <n.icon className="size-4" />{n.label}
              {n.href === "/queue" && drafts > 0 && <Badge variant="warning" className="h-5 min-w-5 px-1.5">{drafts}</Badge>}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-6 md:pt-6 md:pb-12">{children}</main>

      {/* Điện thoại: thanh tab dưới đáy */}
      <nav aria-label="Điều hướng"
        className="bg-background/90 pb-safe fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t backdrop-blur-md md:hidden">
        {primary.map((n) => (
          <Link key={n.href} href={n.href} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
            path === n.href ? "text-foreground font-medium" : "text-muted-foreground")}>
            <span className={cn("relative grid h-7 w-12 place-items-center rounded-full transition-colors", path === n.href && "bg-accent")}>
              <n.icon className="size-5" />
              {n.href === "/queue" && drafts > 0 && (
                <span className="bg-destructive absolute -top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white">{drafts}</span>
              )}
            </span>
            {n.short}
          </Link>
        ))}
        <button onClick={() => setMoreOpen(true)}
          className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", moreActive ? "text-foreground font-medium" : "text-muted-foreground")}>
          <span className={cn("grid h-7 w-12 place-items-center rounded-full", moreActive && "bg-accent")}><Ellipsis className="size-5" /></span>
          Thêm
        </button>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent>
          <DrawerHeader className="sr-only"><DrawerTitle>Menu</DrawerTitle><DrawerDescription>Các mục khác</DrawerDescription></DrawerHeader>
          <div className="grid grid-cols-3 gap-2 p-4">
            {rest.map((n) => (
              <Link key={n.href} href={n.href}
                className={cn("flex flex-col items-center gap-2 rounded-xl px-2 py-4 text-sm",
                  path === n.href ? "bg-primary text-primary-foreground" : "bg-muted")}>
                <n.icon className="size-5" />{n.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t p-4">
            <div className="text-muted-foreground min-w-0 text-xs">
              <div className="truncate">Đăng nhập: {user.via === "threads" ? `@${user.username}` : "admin key"}</div>
              <div className="truncate">AI: {status ? (status.aiEnabled ? status.aiModel : "chưa bật") : "…"}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button asChild size="sm" variant="outline"><a href="/auth/login?mode=connect">{status?.connected ? "Kết nối lại" : "Kết nối bot"}</a></Button>
              <Button size="sm" variant="outline" onClick={logout}><LogOut /> Thoát</Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
