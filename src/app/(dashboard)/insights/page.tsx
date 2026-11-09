"use client";
import { ChartColumn, ExternalLink, RefreshCw } from "lucide-react";
import { api, fmtNum, fmtTime, useAction, useApi } from "@/components/client";
import { EmptyState, ListSkeleton, PageHeader, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EngagementChart, TrendChart } from "@/components/charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Insights {
  at: string;
  account: Record<string, number>;
  posts: Array<{ id: string; text?: string; timestamp?: string; permalink?: string; metrics: Record<string, number> }>;
}
const COLS: Array<[string, string]> = [["views", "Xem"], ["likes", "Thích"], ["replies", "Reply"], ["reposts", "Repost"], ["quotes", "Quote"]];

export default function InsightsPage() {
  const { data, setData, loading } = useApi<Insights | null>("/insights");
  const history = useApi<Array<{ day: string; account: Record<string, number> }>>("/insights/history?days=30");
  const { busy, run } = useAction();
  const posts = data?.posts ?? [];

  return (
    <>
      <PageHeader title="Insights" description={data?.at ? `Cập nhật ${fmtTime(data.at)} · tự làm mới mỗi giờ` : "Chưa có dữ liệu — bấm Làm mới"}>
        <Button variant="outline" disabled={!!busy}
          onClick={() => run("r", async () => { setData(await api<Insights | null>("/insights/refresh", { method: "POST" })); await history.reload(); }, "Đã cập nhật")}>
          {busy ? <Spinner /> : <RefreshCw />} Làm mới
        </Button>
      </PageHeader>

      {loading ? <ListSkeleton /> : !posts.length ? (
        <Card><CardContent><EmptyState icon={<ChartColumn />}>Chưa có bài nào</EmptyState></CardContent></Card>
      ) : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader><CardTitle>Xu hướng tài khoản</CardTitle><CardDescription>30 ngày gần nhất, mỗi ngày 1 điểm</CardDescription></CardHeader>
              <CardContent>
                {(history.data?.length ?? 0) >= 2 ? <TrendChart history={history.data!} />
                  : <EmptyState icon={<ChartColumn />}>Cần ít nhất 2 ngày dữ liệu (insights được lưu mỗi giờ)</EmptyState>}
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader><CardTitle>Tương tác theo bài</CardTitle><CardDescription>{posts.length} bài gần nhất, cũ → mới · chạm cột để xem chi tiết</CardDescription></CardHeader>
              <CardContent><EngagementChart posts={[...posts].reverse()} /></CardContent>
            </Card>
          </div>
          {/* Điện thoại: dạng thẻ */}
          <div className="space-y-3 md:hidden">
            {posts.map((p) => (
              <Card key={p.id} className="gap-3">
                <CardContent className="space-y-3">
                  <div className="text-muted-foreground flex items-center justify-between text-xs">
                    <span>{fmtTime(p.timestamp)}</span>
                    {p.permalink && <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">Mở <ExternalLink className="size-3" /></a>}
                  </div>
                  <p className="line-clamp-4 text-sm whitespace-pre-wrap">{p.text || "(không có chữ)"}</p>
                  <div className="grid grid-cols-5 border-t pt-3 text-center">
                    {COLS.map(([k, l]) => (
                      <div key={k}><div className="font-semibold tabular-nums">{fmtNum(p.metrics?.[k])}</div><div className="text-muted-foreground text-[11px]">{l}</div></div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Máy tính: bảng */}
          <Card className="hidden py-2 md:flex">
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Bài viết</TableHead>{COLS.map(([, l]) => <TableHead key={l} className="text-right">{l}</TableHead>)}<TableHead /></TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-md">
                        <p className="line-clamp-2 whitespace-normal">{p.text || "(không có chữ)"}</p>
                        <p className="text-muted-foreground text-xs">{fmtTime(p.timestamp)}</p>
                      </TableCell>
                      {COLS.map(([k]) => <TableCell key={k} className="text-right tabular-nums">{fmtNum(p.metrics?.[k])}</TableCell>)}
                      <TableCell>{p.permalink && (
                        <Button asChild size="icon" variant="ghost"><a href={p.permalink} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button>
                      )}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
