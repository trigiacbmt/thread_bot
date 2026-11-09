"use client";
import Link from "next/link";
import { ArrowRight, Eye, Flame, Heart, MessageCircle, Users } from "lucide-react";
import { fmtNum, fmtTime, useApi, useStatus } from "@/components/client";
import { ActivityItem, EmptyState, PageHeader, type ActivityRow } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge } from "./viral/score";
import { PostViewsChart } from "@/components/charts";

interface Insights {
  at: string;
  account: Record<string, number>;
  posts: Array<{ id: string; text?: string; timestamp?: string; metrics: Record<string, number> }>;
}
interface SettingsLite {
  autoPostEnabled: boolean; postCron: string; autoReply: boolean; maxRepliesPerHour: number;
  viralCron: string; autoViralDrafts: boolean; viralDailyDrafts: number;
}
interface ViralLite { id: string; text: string | null; username: string | null; score: number; ai_quality: number | null; keyword: string }

export default function OverviewPage() {
  const { status } = useStatus();
  const insights = useApi<Insights | null>("/insights", 300_000);
  const activity = useApi<ActivityRow[]>("/activity?limit=6", 30_000);
  const queue = useApi<Array<{ status: string }>>("/queue", 60_000);
  const settings = useApi<SettingsLite>("/settings");
  const viral = useApi<ViralLite[]>("/viral?status=new&tips=1&limit=4", 120_000);
  const products = useApi<Array<{ active: boolean }>>(status?.affiliateEnabled ? "/products" : null);

  const a = insights.data?.account ?? {};
  const stats = [
    { label: "Lượt xem", value: a.views, hint: "7 ngày", icon: Eye },
    { label: "Lượt thích", value: a.likes, hint: "7 ngày", icon: Heart },
    { label: "Reply", value: a.replies, hint: "7 ngày", icon: MessageCircle },
    { label: "Người theo dõi", value: a.followers_count, hint: "hiện tại", icon: Users },
  ];
  const posts = (insights.data?.posts ?? []).slice(0, 12).reverse();
  const drafts = queue.data?.filter((x) => x.status === "draft").length ?? 0;
  const scheduled = queue.data?.filter((x) => x.status === "scheduled").length ?? 0;
  const lim = status?.publishingLimit;
  const s = settings.data;

  const rows: Array<[string, React.ReactNode]> = [
    ["Tài khoản", status?.connected ? `@${status.username}` : <a className="underline" href="/auth/login?mode=connect">Chưa kết nối — kết nối bot</a>],
    ["Token hết hạn", status?.tokenExpiresAt ? <>{fmtTime(status.tokenExpiresAt)} <span className="text-muted-foreground">(tự gia hạn)</span></> : "–"],
    ["Hạn mức 24h", lim ? `${lim.quota_usage ?? 0}/${lim.config?.quota_total ?? "?"} bài · ${lim.reply_quota_usage ?? 0}/${lim.reply_config?.quota_total ?? "?"} reply` : "–"],
    ["Săn viral", s ? <><code className="bg-muted rounded px-1 text-xs">{s.viralCron}</code>{s.autoViralDrafts ? ` · tự viết ${s.viralDailyDrafts} nháp/ngày` : ""}</> : "…"],
    ["Link sản phẩm", status?.affiliateEnabled
      ? <Link key="p" href="/products" className="underline-offset-4 hover:underline">Bật · {products.data?.filter((p) => p.active).length ?? 0} sản phẩm</Link>
      : <Link key="p" href="/settings" className="text-muted-foreground underline-offset-4 hover:underline">Tắt</Link>],
    ["Hàng đợi", <Link key="q" href="/queue" className="underline-offset-4 hover:underline">{drafts} nháp · {scheduled} đã lên lịch</Link>],
    ["Tự trả lời", s ? (s.autoReply ? `Bật · tối đa ${s.maxRepliesPerHour}/giờ` : "Tắt") : "…"],
  ];

  return (
    <>
      <PageHeader title="Tổng quan" description={insights.data ? `7 ngày gần nhất · cập nhật ${fmtTime(insights.data.at)}` : "7 ngày gần nhất"} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {stats.map((st) => (
          <Card key={st.label} className="gap-1 py-4">
            <CardHeader className="flex items-center justify-between gap-2">
              <CardDescription>{st.label}</CardDescription>
              <st.icon className="text-muted-foreground size-4" />
            </CardHeader>
            <CardContent>
              {insights.loading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-semibold tabular-nums md:text-3xl">{fmtNum(st.value)}</div>}
              <p className="text-muted-foreground text-xs">{st.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Flame className="text-destructive size-4" /> Bài viral nổi nhất chưa dùng</CardTitle>
          <CardAction><Button asChild size="sm" variant="ghost"><Link href="/viral">Tất cả <ArrowRight /></Link></Button></CardAction>
        </CardHeader>
        <CardContent>
          {viral.loading ? <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            : !viral.data?.length ? <EmptyState icon={<Flame />}>Chưa có — vào <Link className="underline" href="/viral">Săn viral</Link> bấm Quét ngay</EmptyState>
            : <div className="divide-y">{viral.data.map((v) => (
              <Link key={v.id} href="/viral" className="hover:bg-muted/50 -mx-2 flex gap-3 rounded-lg px-2 py-3">
                <ScoreBadge score={Number(v.score)} />
                <div className="min-w-0">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="text-foreground font-medium">@{v.username}</span><span>{v.keyword}</span>{v.ai_quality && <span>· {v.ai_quality}/10</span>}
                  </div>
                  <p className="line-clamp-2 text-sm">{v.text}</p>
                </div>
              </Link>
            ))}</div>}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Lượt xem theo bài</CardTitle><CardDescription>{posts.length ? `${posts.length} bài gần nhất, cũ → mới` : " "}</CardDescription></CardHeader>
          <CardContent>
            {posts.length ? (
              <PostViewsChart posts={posts} />
            ) : <EmptyState>Chưa có dữ liệu — vào <Link className="underline" href="/insights">Insights</Link> bấm Làm mới</EmptyState>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Trạng thái bot</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                  <dt className="text-muted-foreground shrink-0">{k}</dt><dd className="min-w-0 text-right break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Hoạt động gần đây</CardTitle>
          <CardAction><Button asChild size="sm" variant="ghost"><Link href="/logs">Nhật ký <ArrowRight /></Link></Button></CardAction>
        </CardHeader>
        <CardContent>
          {activity.loading ? <Skeleton className="h-24" /> : activity.data?.length
            ? activity.data.map((x) => <ActivityItem key={x.id} a={x} />)
            : <EmptyState>Chưa có hoạt động</EmptyState>}
        </CardContent>
      </Card>
      {!status?.connected && status && (
        <Badge variant="warning" className="mt-4">Chưa kết nối tài khoản Threads — bot chưa chạy</Badge>
      )}
    </>
  );
}
