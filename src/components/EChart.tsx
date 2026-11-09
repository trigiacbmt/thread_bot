"use client";
// Wrapper ECharts tối giản: chỉ nạp các phần cần dùng (tree-shaking), tự resize theo khung,
// đổi bảng màu theo dark mode, tooltip chạm được trên điện thoại.
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, type BarSeriesOption, type LineSeriesOption } from "echarts/charts";
import {
  GridComponent, LegendComponent, TooltipComponent,
  type GridComponentOption, type LegendComponentOption, type TooltipComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export type ChartOption = echarts.ComposeOption<
  BarSeriesOption | LineSeriesOption | GridComponentOption | TooltipComponentOption | LegendComponentOption
>;

export interface ChartTheme {
  dark: boolean;
  text: string;
  muted: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  /** views, likes, replies, reposts, quotes, followers */
  palette: string[];
}

/** Bảng màu theo chế độ sáng/tối (khớp theme shadcn trong globals.css). */
export function useChartTheme(): ChartTheme {
  const dark = useMediaQuery("(prefers-color-scheme: dark)");
  return useMemo(() => dark
    ? { dark, text: "#e5e5e5", muted: "#a3a3a3", grid: "rgba(255,255,255,0.08)", tooltipBg: "#262626", tooltipBorder: "#404040",
        palette: ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#e5e5e5"] }
    : { dark, text: "#171717", muted: "#737373", grid: "#ececea", tooltipBg: "#ffffff", tooltipBorder: "#e5e5e5",
        palette: ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#171717"] }, [dark]);
}

/** Tuỳ chọn chung cho mọi biểu đồ: font, lưới, tooltip, legend. */
export function baseOption(t: ChartTheme, compact: boolean): ChartOption {
  return {
    color: t.palette,
    textStyle: { fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif", color: t.text },
    grid: { left: 4, right: 4, top: compact ? 36 : 40, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      confine: true, // không tràn khỏi khung trên điện thoại
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.text, fontSize: 12 },
      axisPointer: { type: "shadow", shadowStyle: { color: t.dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" } },
      extraCssText: "border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);max-width:260px;white-space:normal;",
    },
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: compact ? 10 : 16, textStyle: { color: t.muted, fontSize: compact ? 11 : 12 } },
  };
}

export const axisStyle = (t: ChartTheme) => ({
  axisLine: { lineStyle: { color: t.grid } },
  axisTick: { show: false },
  axisLabel: { color: t.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: t.grid } },
});

export function EChart({ option, className, height = 260 }: { option: ChartOption; className?: string; height?: number | string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} className={cn("w-full", className)} style={{ height }} role="img" aria-label="Biểu đồ" />;
}
