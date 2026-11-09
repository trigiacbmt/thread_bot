import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threads Bot · Dashboard",
  robots: { index: false },
  appleWebApp: { capable: true, title: "Threads Bot", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // cho phép dùng env(safe-area-inset-*) trên iPhone có tai thỏ
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: extension trình duyệt (ColorZilla, Grammarly…) hay chèn thuộc tính vào <html>/<body>,
    // gây cảnh báo hydration vô hại. Chỉ bỏ qua đúng 2 thẻ này, không ảnh hưởng phần còn lại.
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
