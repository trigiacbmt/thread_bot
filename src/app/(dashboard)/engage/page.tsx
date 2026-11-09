"use client";
import { useState } from "react";
import { EyeOff, MessageCircle, Reply } from "lucide-react";
import { api, useAction, useApi } from "@/components/client";
import { ActivityItem, EmptyState, FilterChips, ListSkeleton, PageHeader, TextDialog, type ActivityRow } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type F = "all" | "reply" | "mention" | "skip";

export default function EngagePage() {
  const { data, loading, reload } = useApi<ActivityRow[]>("/activity?limit=300&types=reply,mention,skip", 20_000);
  const { busy, run } = useAction();
  const [filter, setFilter] = useState<F>("all");
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; username?: string } | null>(null);
  const items = (data ?? []).filter((a) => filter === "all" || a.type === filter);

  return (
    <>
      <PageHeader title="Tương tác" description="Reply và mention gửi đến, cùng các câu bot đã trả lời." />
      <FilterChips<F> value={filter} onChange={setFilter} options={[["all", "Tất cả"], ["reply", "Reply"], ["mention", "Mention"], ["skip", "Bỏ qua"]]} />
      {loading ? <ListSkeleton /> : (
        <Card className="py-1 md:py-2">
          <CardContent>
            {!items.length ? <EmptyState icon={<MessageCircle />}>Chưa có tương tác. Bật webhook để nhận reply/mention theo thời gian thực.</EmptyState>
              : items.map((a) => {
                // Sự kiện đến (mention / reply của người khác) có data.id = id bài của họ
                const incoming = a.type === "mention" || (a.type === "reply" && a.data?.id && !a.data?.postId);
                const id = incoming ? String(a.data!.id) : null;
                return (
                  <ActivityItem key={a.id} a={a} actions={id && <>
                    <Button size="sm" variant="outline" onClick={() => setReplyTo({ id, text: String(a.data?.text ?? a.message), username: a.data?.username as string | undefined })}>
                      <Reply /> Trả lời
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === id}
                      onClick={() => run(id, () => api("/hide-reply", { method: "POST", body: { replyId: id } }), "Đã ẩn reply")}>
                      <EyeOff /> Ẩn
                    </Button>
                  </>} />
                );
              })}
          </CardContent>
        </Card>
      )}
      <TextDialog open={!!replyTo} title={`Trả lời @${replyTo?.username ?? ""}`} saveLabel="Gửi trả lời" onClose={() => setReplyTo(null)}
        onAi={async () => (await api<{ text: string | null }>("/ai/reply", { method: "POST", body: { text: replyTo!.text, username: replyTo!.username } })).text}
        onSave={(text) => run("reply", async () => {
          await api("/reply", { method: "POST", body: { replyToId: replyTo!.id, text } });
          await reload();
        }, "Đã trả lời")} />
    </>
  );
}
