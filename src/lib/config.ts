// Cấu hình đọc từ biến môi trường (Next.js tự nạp .env / .env.local).
// Dùng getter để không lỗi lúc `next build` khi chưa có .env.
// Lưu ý: chỉ chứa bí mật/kết nối. Model AI, chủ đề, từ khoá, lịch, múi giờ… chỉnh trong trang Cài đặt (src/lib/settings.ts).
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (xem .env.example)`);
  return v;
}

export const config = {
  get appId() { return req("THREADS_APP_ID"); },
  get appSecret() { return req("THREADS_APP_SECRET"); },
  get redirectUri() { return req("THREADS_REDIRECT_URI"); },
  get webhookVerifyToken() { return req("WEBHOOK_VERIFY_TOKEN"); },
  /** Tuỳ chọn: mật khẩu dự phòng để vào dashboard khi chưa đăng nhập được bằng Threads (VD chạy localhost). */
  get adminKey() { return process.env.ADMIN_KEY ?? ""; },
  /** Danh sách username Threads được vào dashboard (phân cách bằng dấu phẩy). Trống = người đăng nhập đầu tiên làm chủ. */
  get allowedThreadsUsers() {
    return (process.env.ALLOWED_THREADS_USERS ?? "").split(",").map((u) => u.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
  },
  /** Khoá ký cookie phiên đăng nhập. Không đặt thì dùng THREADS_APP_SECRET. */
  get sessionSecret() { return process.env.SESSION_SECRET || req("THREADS_APP_SECRET"); },
  /** Bảo vệ /api/cron/* khi gọi từ cron bên ngoài (Vercel Cron, cron-job.org...) */
  get cronSecret() { return process.env.CRON_SECRET ?? ""; },

  /** Tuỳ chọn: token Apify để săn bài viral không cần Meta App Review */
  get apifyToken() { return process.env.APIFY_TOKEN ?? ""; },

  get anthropicKey() { return process.env.ANTHROPIC_API_KEY ?? ""; },

  // Quyền xin khi đăng nhập. Bỏ bớt nếu chưa cần.
  scopes: [
    "threads_basic",
    "threads_content_publish",
    "threads_read_replies",
    "threads_manage_replies",
    "threads_manage_insights",
    "threads_manage_mentions",
    "threads_keyword_search",
  ],
};
