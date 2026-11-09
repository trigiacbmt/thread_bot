"use client";
// Các biểu đồ của dashboard, dựng bằng ECharts.
import { useMemo } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { EChart, axisStyle, baseOption, useChartTheme, type ChartOption } from "./EChart";

export interface PostMetrics {
  id: string;
  text?: string;
  timestamp?: string;
  metrics: Record<string, number>;
}

const nf = new Intl.NumberFormat("vi-VN");
const compactNf = new Intl.NumberFormat("vi-VN", { notation: "compact" });
/** "dd/MM" theo giờ Việt Nam */
const shortDate = (iso?: string) => {
  if (!iso) return "";
  const [y, m, d] = new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).split("-");
  return y ? `${d}/${m}` : "";
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const snippet = (s = "", n = 70) => esc(s.length > n ? s.slice(0, n) + "…" : s).replace(/\n/g, " ");

type AxisParam = { dataIndex: number; seriesName: string; value: number; marker: string };

/** Tooltip: đoạn đầu bài viết + giá trị từng series. */
function postTooltip(posts: PostMetrics[]) {
  return (params: unknown) => {
    const list = params as AxisParam[];
    const p = posts[list[0]?.dataIndex];
    if (!p) return "";
    const rows = list.map((x) => `${x.marker}${x.seriesName}: <b>${nf.format(x.value ?? 0)}</b>`).join("<br/>");
    return `<div style="font-size:11px;opacity:.7">${shortDate(p.timestamp)}</div><div style="margin:2px 0 6px">${snippet(p.text)}</div>${rows}`;
  };
}

/** Lượt xem từng bài (trang Tổng quan). posts theo thứ tự cũ → mới. */
export function PostViewsChart({ posts, height = 220 }: { posts: PostMetrics[]; height?: number }) {
  const t = useChartTheme();
  const compact = useMediaQuery("(max-width: 767px)");
  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t, compact);
    return {
      ...base,
      legend: { show: false },
      grid: { ...(base.grid as object), top: 12 },
      tooltip: { ...(base.tooltip as object), formatter: postTooltip(posts) },
      xAxis: { type: "category", data: posts.map((p) => shortDate(p.timestamp)), ...axisStyle(t), splitLine: { show: false } },
      yAxis: { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => compactNf.format(v) } },
      series: [{
        name: "Lượt xem", type: "bar", barMaxWidth: 36,
        data: posts.map((p) => p.metrics?.views ?? 0),
        itemStyle: { borderRadius: [6, 6, 0, 0], color: t.palette[0] },
        emphasis: { itemStyle: { opacity: 0.85 } },
      }],
    };
  }, [posts, t, compact]);
  return <EChart option={option} height={height} />;
}

/** Tương tác từng bài: cột chồng (thích/reply/repost/quote) + đường lượt xem (trục phải). */
export function EngagementChart({ posts, height }: { posts: PostMetrics[]; height?: number }) {
  const t = useChartTheme();
  const compact = useMediaQuery("(max-width: 767px)");
  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t, compact);
    const stack = (key: string, name: string, color: string, top = false) => ({
      name, type: "bar" as const, stack: "eng", barMaxWidth: 32, data: posts.map((p) => p.metrics?.[key] ?? 0),
      itemStyle: { color, borderRadius: top ? [5, 5, 0, 0] : 0 },
    });
    return {
      ...base,
      tooltip: { ...(base.tooltip as object), formatter: postTooltip(posts) },
      xAxis: { type: "category", data: posts.map((p) => shortDate(p.timestamp)), ...axisStyle(t), splitLine: { show: false } },
      yAxis: [
        { type: "value", name: compact ? "" : "Tương tác", nameTextStyle: { color: t.muted, fontSize: 11 }, ...axisStyle(t),
          axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => compactNf.format(v) } },
        { type: "value", name: compact ? "" : "Lượt xem", nameTextStyle: { color: t.muted, fontSize: 11 }, ...axisStyle(t),
          splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => compactNf.format(v) } },
      ],
      series: [
        stack("likes", "Thích", t.palette[1]),
        stack("replies", "Reply", t.palette[2]),
        stack("reposts", "Repost", t.palette[3]),
        stack("quotes", "Quote", t.palette[4], true),
        {
          name: "Lượt xem", type: "line", yAxisIndex: 1, smooth: true, symbol: "circle", symbolSize: 6,
          data: posts.map((p) => p.metrics?.views ?? 0), lineStyle: { width: 2, color: t.palette[0] }, itemStyle: { color: t.palette[0] },
        },
      ],
    };
  }, [posts, t, compact]);
  return <EChart option={option} height={height ?? (compact ? 280 : 320)} />;
}

/** Xu hướng tài khoản theo ngày: lượt xem 7 ngày (vùng, trục trái) + người theo dõi (đường đứt, trục phải). */
export function TrendChart({ history, height }: { history: Array<{ day: string; account: Record<string, number> }>; height?: number }) {
  const t = useChartTheme();
  const compact = useMediaQuery("(max-width: 767px)");
  const option = useMemo<ChartOption>(() => {
    const base = baseOption(t, compact);
    const days = history.map((h) => h.day.slice(8, 10) + "/" + h.day.slice(5, 7));
    return {
      ...base,
      tooltip: { ...(base.tooltip as object), axisPointer: { type: "line", lineStyle: { color: t.muted, type: "dashed" } },
        valueFormatter: (v) => nf.format(Number(v ?? 0)) },
      xAxis: { type: "category", boundaryGap: false, data: days, ...axisStyle(t), splitLine: { show: false } },
      yAxis: [
        { type: "value", ...axisStyle(t), axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => compactNf.format(v) } },
        { type: "value", scale: true, ...axisStyle(t), splitLine: { show: false },
          axisLabel: { color: t.muted, fontSize: 11, formatter: (v: number) => compactNf.format(v) } },
      ],
      series: [
        {
          name: "Lượt xem (7 ngày)", type: "line", smooth: true, showSymbol: history.length < 15, data: history.map((h) => h.account.views ?? 0),
          lineStyle: { width: 2, color: t.palette[0] }, itemStyle: { color: t.palette[0] },
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [
            { offset: 0, color: t.palette[0] + "40" }, { offset: 1, color: t.palette[0] + "00" }] } },
        },
        {
          name: "Người theo dõi", type: "line", yAxisIndex: 1, smooth: true, showSymbol: false, data: history.map((h) => h.account.followers_count ?? null),
          lineStyle: { width: 2, type: "dashed", color: t.palette[5] }, itemStyle: { color: t.palette[5] },
        },
      ],
    };
  }, [history, t, compact]);
  return <EChart option={option} height={height ?? (compact ? 240 : 280)} />;
}
