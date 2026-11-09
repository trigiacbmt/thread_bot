// Kiểm tra một biểu thức cron 5 trường có khớp với một thời điểm (theo múi giờ) hay không.
// Hỗ trợ: *, số, danh sách (1,2), khoảng (1-5), bước (*/3, 0-30/10). Đủ cho lịch đăng bài.

const RANGES: Array<[number, number]> = [
  [0, 59], // phút
  [0, 23], // giờ
  [1, 31], // ngày trong tháng
  [1, 12], // tháng
  [0, 7], //  thứ (0 và 7 = Chủ nhật)
];

function parseField(field: string, [min, max]: [number, number]): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) return null;
    const step = m[2] ? Number(m[2]) : 1;
    let lo = min, hi = max;
    if (m[1] !== "*") {
      const [a, b] = m[1].split("-").map(Number);
      lo = a;
      hi = b ?? (m[2] ? max : a);
    }
    if (lo < min || hi > max || lo > hi || step < 1) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function isValidCron(expr: string): boolean {
  const f = expr.trim().split(/\s+/);
  return f.length === 5 && f.every((x, i) => parseField(x, RANGES[i]) !== null);
}

function partsInTz(date: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, minute: "numeric", hour: "numeric", day: "numeric", month: "numeric", weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return [Number(get("minute")), Number(get("hour")) % 24, Number(get("day")), Number(get("month")), wd];
}

export function cronMatches(expr: string, date: Date, timeZone: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const sets = fields.map((f, i) => parseField(f, RANGES[i]));
  if (sets.some((s) => !s)) return false;
  const [mi, h, dom, mon, dow] = partsInTz(date, timeZone);
  const dowSet = sets[4]!;
  const dowOk = dowSet.has(dow) || (dow === 0 && dowSet.has(7));
  // Theo chuẩn cron: nếu cả ngày-tháng và thứ đều bị giới hạn thì khớp một trong hai
  const domRestricted = fields[2] !== "*", dowRestricted = fields[4] !== "*";
  const dayOk = domRestricted && dowRestricted ? sets[2]!.has(dom) || dowOk : sets[2]!.has(dom) && dowOk;
  return sets[0]!.has(mi) && sets[1]!.has(h) && sets[3]!.has(mon) && dayOk;
}
