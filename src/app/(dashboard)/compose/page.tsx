"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, Send, Sparkles } from "lucide-react";
import { api, charLen, fromLocalInput, useAction, useApi, useStatus, useToast } from "@/components/client";
import { Counter, Field, PageHeader, ProductPicker, Spinner, type ProductOption } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface QueueResult { status: string; error?: string | null }

function PostPreview({ avatar, name, label, children }: { avatar: string; name: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold">{avatar}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm"><span className="font-semibold">{name}</span> <span className="text-muted-foreground">· {label}</span></div>
        <div className="mt-1 text-sm break-words whitespace-pre-wrap">{children}</div>
      </div>
    </div>
  );
}

export default function ComposePage() {
  const { status } = useStatus();
  const notify = useToast();
  const router = useRouter();
  const { busy, run } = useAction();
  const affiliate = status?.affiliateEnabled ?? false;
  const { data: products } = useApi<ProductOption[]>(affiliate ? "/products" : null);
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [at, setAt] = useState("");
  const [productId, setProductId] = useState("");
  const [linkMode, setLinkMode] = useState<"reply" | "inline" | "none">("reply");
  const max = status?.maxText ?? 500;
  const invalid = !text.trim() || charLen(text) > max;
  const product = affiliate ? products?.find((p) => p.id === productId) : undefined;
  const user = status?.username ?? "tài khoản";

  const submit = (publishNow: boolean) =>
    run(publishNow ? "now" : "queue", async () => {
      const r = await api<QueueResult>("/queue", {
        method: "POST",
        body: { text, imageUrl: imageUrl.trim() || undefined, scheduledAt: fromLocalInput(at), publishNow, productId: (affiliate && productId) || undefined, linkMode },
      });
      if (r.status === "failed") throw new Error("Đăng thất bại: " + r.error);
      setText(""); setImageUrl(""); setAt(""); setProductId("");
      if (!publishNow) router.push("/queue");
    }, publishNow ? "Đã đăng lên Threads" : "Đã thêm vào hàng đợi");

  const linkText = product && <span className="text-muted-foreground">👉 {product.name}: <u className="break-all">{product.affiliateUrl}</u></span>;

  return (
    <>
      <PageHeader title="Soạn bài" description="Viết tay hoặc để AI viết, rồi đăng ngay hoặc lên lịch." />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <Card>
          <CardContent className="grid gap-4">
            <Field label="Nhờ AI viết theo chủ đề">
              <div className="flex gap-2">
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: 3 mẹo giữ rau tươi cả tuần" />
                <Button variant="outline" disabled={!!busy || !status?.aiEnabled} onClick={() => {
                  if (!topic.trim()) return notify("Nhập chủ đề trước", true);
                  run("ai", async () => setText((await api<{ text: string }>("/ai/post", { method: "POST", body: { topic } })).text), "AI đã viết xong");
                }}>{busy === "ai" ? <Spinner /> : <Sparkles />}<span className="hidden sm:inline">AI viết</span></Button>
              </div>
            </Field>
            <Field label="Nội dung">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Bạn đang nghĩ gì?" className="min-h-40" />
              <Counter text={text} />
            </Field>
            {affiliate && <ProductPicker products={products ?? []} value={productId} onChange={setProductId} linkMode={linkMode} onLinkMode={setLinkMode} />}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Link ảnh (tuỳ chọn)"><Input type="url" inputMode="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." /></Field>
              <Field label="Lên lịch (trống = phút kế tiếp)"><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
            </div>
            <div className="flex gap-2 *:flex-1 md:*:flex-none">
              <Button disabled={!!busy || invalid || !status?.connected} onClick={() => submit(true)}>{busy === "now" ? <Spinner /> : <Send />} Đăng ngay</Button>
              <Button variant="outline" disabled={!!busy || invalid} onClick={() => submit(false)}>{busy === "queue" ? <Spinner /> : <ListPlus />} Vào hàng đợi</Button>
            </div>
            {!status?.connected && <p className="text-muted-foreground text-xs">Kết nối tài khoản Threads để đăng.</p>}
          </CardContent>
        </Card>

        <Card className="h-fit md:sticky md:top-32">
          <CardHeader><CardTitle className="text-muted-foreground text-sm font-medium">Xem trước</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <PostPreview avatar={user[0].toUpperCase()} name={user} label="vừa xong">
              {text || <span className="text-muted-foreground">Nội dung bài viết sẽ hiện ở đây…</span>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {imageUrl.trim() && <img src={imageUrl.trim()} alt="" className="mt-2 max-h-64 rounded-lg border" />}
              {product && linkMode === "inline" && <><br /><br />{linkText}</>}
            </PostPreview>
            {product && linkMode === "reply" && (
              <div className="ml-4 border-l-2 pl-4"><PostPreview avatar={user[0].toUpperCase()} name={user} label="reply">{linkText}</PostPreview></div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
