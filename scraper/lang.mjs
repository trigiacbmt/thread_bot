// Bản JS của src/lib/lang.ts cho scraper (giữ 2 file giống nhau).

const VN_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;
const VN_ONLY = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i; // ký tự gần như chỉ tiếng Việt có
// Từ hay gặp khi người Việt gõ không dấu
const VN_NO_ACCENT = new Set([
  "khong", "duoc", "nhung", "minh", "nguoi", "cung", "nhieu", "roi", "nha", "nhe", "voi", "mot", "nay", "thi",
  "ban", "cua", "lam", "gi", "the", "cai", "nen", "phai", "biet", "di", "ve", "den", "hay", "meo", "nhanh", "tien",
]);

/** true nếu đoạn văn nhiều khả năng là tiếng Việt. */
export function isVietnamese(text) {
  if (!text) return false;
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 8) return VN_ONLY.test(text);
  // Phần lớn không phải chữ Latin (Thái, Trung, Hàn, Nhật…) → không phải tiếng Việt
  const latin = letters.filter((c) => /[a-zA-ZÀ-ỹđĐ]/.test(c)).length;
  if (latin / letters.length < 0.6) return false;
  const vn = (text.match(VN_CHARS) ?? []).length;
  if (vn / latin >= 0.04 && VN_ONLY.test(text)) return true;
  // Không dấu: đếm số từ Việt đặc trưng
  const words = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]+/g) ?? [];
  const hits = words.filter((w) => VN_NO_ACCENT.has(w)).length;
  return hits >= 3 && hits / words.length >= 0.12;
}
