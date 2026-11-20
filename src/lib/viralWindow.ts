// Khoảng thời gian đăng bài cần lấy khi săn viral: "N giờ gần đây" hoặc "từ ngày … đến ngày …".
// Bản JS tương ứng nằm trong scraper/index.mjs (viralWindow) — sửa thì sửa cả hai.

export type ViralDateMode = "recent" | "range";

interface WindowSettings {
  timezone: string;
  viralDateMode: ViralDateMode;
  viralMaxAgeHours: number;
  viralDateFrom: string; // YYYY-MM-DD, theo múi giờ cài đặt
  viralDateTo: string;   // YYYY-MM-DD, tính trọn ngày; trống = tới hiện tại
}

export interface ViralWindow {
  /** Unix giây */
  since: number;
  /** Unix giây, null = không giới hạn trên */
  until: number | null;
  /** Ngày dạng YYYY-MM-DD (dùng cho bộ lọc after:/before: của Threads), null khi ở chế độ "gần đây" */
  fromDate: string | null;
  /** Ngày SAU ngày kết thúc (before: của Threads là "trước ngày này") */
  beforeDate: string | null;
  label: string;
}

/** Mốc 00:00 của ngày YYYY-MM-DD theo múi giờ tz, trả về unix giây. */
export function startOfDayInTz(date: string, tz: string): number {
  const utc = Date.parse(`${date}T00:00:00Z`);
  const asTz = Date.parse(new Date(utc).toLocaleString("en-US", { timeZone: tz }));
  const asUtc = Date.parse(new Date(utc).toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.floor((utc - (asTz - asUtc)) / 1000);
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const viDate = (d: string) => d.split("-").reverse().join("/");

export function viralWindow(s: WindowSettings, now = Date.now()): ViralWindow {
  if (s.viralDateMode === "range" && s.viralDateFrom) {
    const to = s.viralDateTo || null;
    const beforeDate = to ? addDays(to, 1) : null;
    return {
      since: startOfDayInTz(s.viralDateFrom, s.timezone),
      until: beforeDate ? startOfDayInTz(beforeDate, s.timezone) - 1 : null,
      fromDate: s.viralDateFrom,
      beforeDate,
      label: to ? `${viDate(s.viralDateFrom)} – ${viDate(to)}` : `từ ${viDate(s.viralDateFrom)}`,
    };
  }
  return {
    since: Math.floor(now / 1000) - s.viralMaxAgeHours * 3600,
    until: null,
    fromDate: null,
    beforeDate: null,
    label: `${s.viralMaxAgeHours} giờ gần đây`,
  };
}

/** Bài đăng lúc `postedAt` (ISO hoặc unix giây) có nằm trong khoảng không. Không rõ ngày đăng → giữ. */
export function inWindow(w: ViralWindow, postedAt: string | number | null | undefined): boolean {
  if (postedAt == null || postedAt === "") return true;
  const t = typeof postedAt === "number" ? postedAt : Date.parse(postedAt) / 1000;
  if (!Number.isFinite(t)) return true;
  return t >= w.since && (w.until == null || t <= w.until);
}
