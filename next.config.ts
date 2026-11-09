import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-cron chỉ dùng phía server (instrumentation), không cần bundle
  serverExternalPackages: ["node-cron"],
  // Cho phép mở dev server qua tunnel HTTPS (cần để test đăng nhập Threads khi chạy local).
  // Next.js mặc định chặn domain khác localhost gọi tới dev server.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev"],
};

export default nextConfig;
