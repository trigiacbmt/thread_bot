"use client";
import { useState } from "react";
import { ScrollText } from "lucide-react";
import { useApi } from "@/components/client";
import { ActivityItem, EmptyState, FilterChips, ListSkeleton, PageHeader, type ActivityRow } from "@/components/ui";
import { Card, CardContent } from "@/components/ui/card";

const GROUPS: Record<string, string> = {
  post: "post", reply: "reply", error: "error", auth: "auth", info: "info,skip,watch,mention",
};

export default function LogsPage() {
  const [filter, setFilter] = useState("all");
  const { data, loading } = useApi<ActivityRow[]>(`/activity?limit=300${filter !== "all" ? `&types=${GROUPS[filter]}` : ""}`, 30_000);

  return (
    <>
      <PageHeader title="Nhật ký" description="Mọi hoạt động của bot, mới nhất ở trên." />
      <FilterChips value={filter} onChange={setFilter} options={[
        ["all", "Tất cả"], ["post", "Đăng bài"], ["reply", "Reply"], ["error", "Lỗi"], ["auth", "Tài khoản"], ["info", "Khác"],
      ]} />
      {loading ? <ListSkeleton /> : (
        <Card className="py-1 md:py-2">
          <CardContent>
            {data?.length ? data.map((a) => <ActivityItem key={a.id} a={a} />) : <EmptyState icon={<ScrollText />}>Trống</EmptyState>}
          </CardContent>
        </Card>
      )}
    </>
  );
}
