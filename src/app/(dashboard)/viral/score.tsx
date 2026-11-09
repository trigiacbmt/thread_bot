import { cn } from "@/lib/utils";

/** Ô điểm viral: đỏ ≥ 60, cam ≥ 30, xám còn lại. */
export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone = score >= 60 ? "bg-destructive/10 text-destructive" : score >= 30 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground";
  return (
    <div title="Điểm viral" className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-base font-bold tabular-nums", tone, className)}>
      {Math.round(score)}
    </div>
  );
}
