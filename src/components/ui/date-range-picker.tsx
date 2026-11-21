"use client";
// Chọn khoảng ngày (không cần thư viện ngoài). Ngày dạng "YYYY-MM-DD".
import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const vi = (d: string) => d.split("-").reverse().join("/");
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export interface DateRangePickerProps {
  from: string;
  /** "" = tới hôm nay */
  to: string;
  onChange: (from: string, to: string) => void;
  /** Ngày lớn nhất được chọn (thường là hôm nay) */
  max: string;
  presets?: Array<[days: number, label: string]>;
  className?: string;
}

export function DateRangePicker({ from, to, onChange, max, presets = [], className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [picking, setPicking] = React.useState(false); // đã chọn ngày bắt đầu, đang chờ ngày kết thúc
  const [hover, setHover] = React.useState<string | null>(null);
  const anchor = to || from || max;
  const [view, setView] = React.useState(() => ({ y: +anchor.slice(0, 4), m: +anchor.slice(5, 7) - 1 }));

  React.useEffect(() => {
    if (!open) return;
    const a = to || from || max;
    setView({ y: +a.slice(0, 4), m: +a.slice(5, 7) - 1 });
    setPicking(false);
    setHover(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const end = to || (from ? max : "");
  const previewEnd = picking && hover && hover >= from ? hover : end;

  const pick = (d: string) => {
    if (!picking || !from || d < from) {
      onChange(d, "");
      setPicking(true);
      return;
    }
    onChange(from, d === max ? "" : d);
    setPicking(false);
    setOpen(false);
  };

  const first = new Date(Date.UTC(view.y, view.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // T2 đứng đầu
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(view.y, view.m, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);

  const move = (n: number) => setView(({ y, m }) => {
    const t = y * 12 + m + n;
    return { y: Math.floor(t / 12), m: t % 12 };
  });
  const canNext = iso(view.y, view.m, daysInMonth) < max;

  const label = from ? `${vi(from)} – ${to ? vi(to) : "hôm nay"}` : "Chọn khoảng ngày";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline"
          className={cn("h-10 w-full justify-between px-3 font-normal", !from && "text-muted-foreground", className)}>
          <span className="truncate">{label}</span>
          <CalendarDays className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[19rem] max-w-[calc(100vw-1.5rem)]">
        <div className="mb-2 flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => move(-1)} aria-label="Tháng trước">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-sm font-medium">Tháng {view.m + 1}, {view.y}</div>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => move(1)} disabled={!canNext} aria-label="Tháng sau">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((w) => <div key={w} className="text-muted-foreground pb-1 text-[11px] font-medium">{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="h-9" />;
            const disabled = d > max;
            const isStart = d === from;
            const isEnd = !!previewEnd && d === previewEnd;
            const inRange = !!from && !!previewEnd && d > from && d < previewEnd;
            const isToday = d === max;
            return (
              <div key={d} className={cn("h-9 p-0",
                inRange && "bg-accent",
                isStart && previewEnd && previewEnd > from && "bg-accent rounded-l-md",
                isEnd && previewEnd > from && "bg-accent rounded-r-md")}>
                <button type="button" disabled={disabled}
                  onClick={() => pick(d)}
                  onMouseEnter={() => setHover(d)}
                  className={cn(
                    "size-9 rounded-md text-sm tabular-nums transition-colors",
                    "hover:bg-muted disabled:text-muted-foreground/40 disabled:hover:bg-transparent",
                    isToday && !isStart && !isEnd && "font-semibold text-primary underline underline-offset-4",
                    (isStart || isEnd) && "bg-primary text-primary-foreground hover:bg-primary",
                  )}>
                  {+d.slice(8)}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-muted-foreground mt-2 min-h-4 text-xs">
          {picking ? "Chọn ngày kết thúc" : from ? `Đang chọn: ${label}` : "Chọn ngày bắt đầu"}
        </p>

        {presets.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2">
            {presets.map(([days, l]) => (
              <Button key={days} type="button" size="sm" variant="secondary" className="h-7 text-xs"
                onClick={() => { onChange(shift(max, -(days - 1)), ""); setOpen(false); }}>
                {l}
              </Button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
