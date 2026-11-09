"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AtSign, CircleAlert, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "./ui";

/** Lỗi trả về từ /auth/callback (?login_error=...) */
function LoginError() {
  const err = useSearchParams().get("login_error");
  if (!err) return null;
  return (
    <div className="border-destructive/30 bg-destructive/5 text-destructive flex gap-2 rounded-lg border p-3 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0" /><span>{err}</span>
    </div>
  );
}

function AdminKeyForm() {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
    if (res.ok) return location.replace("/");
    setErr((await res.json().catch(() => ({}))).error ?? "Đăng nhập thất bại");
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="adminKey" className="text-muted-foreground font-normal">Admin key (biến ADMIN_KEY)</Label>
        <Input id="adminKey" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} aria-invalid={!!err} />
        {err && <p className="text-destructive text-sm">{err}</p>}
      </div>
      <Button type="submit" variant="outline" disabled={busy || !key}>{busy ? <Spinner /> : <KeyRound />} Vào bằng admin key</Button>
    </form>
  );
}

export function LoginForm({ adminKeyEnabled }: { adminKeyEnabled: boolean }) {
  const [showKey, setShowKey] = useState(false);
  const [going, setGoing] = useState(false);
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="bg-primary text-primary-foreground mb-2 grid size-10 place-items-center rounded-xl text-lg font-bold">@</div>
          <CardTitle className="text-xl">Threads Bot</CardTitle>
          <CardDescription>Đăng nhập bằng tài khoản Threads của bạn. Chỉ chủ tài khoản mới vào được dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Suspense><LoginError /></Suspense>
          {/* Route handler OAuth → điều hướng toàn trang */}
          <Button asChild size="lg" className="w-full" onClick={() => setGoing(true)}>
            <a href="/auth/login">{going ? <Spinner /> : <AtSign />} Đăng nhập bằng Threads</a>
          </Button>
          <p className="text-muted-foreground text-xs">
            Mật khẩu chỉ nhập trên trang của Threads. Lần đăng nhập đầu tiên cũng kết nối bot với tài khoản này.
          </p>
          {adminKeyEnabled && (
            <>
              <div className="flex items-center gap-3"><Separator className="flex-1" /><span className="text-muted-foreground text-xs">hoặc</span><Separator className="flex-1" /></div>
              {showKey ? <AdminKeyForm /> : (
                <Button variant="ghost" size="sm" onClick={() => setShowKey(true)}><KeyRound /> Dùng admin key dự phòng</Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
