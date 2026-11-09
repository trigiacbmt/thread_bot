import type { MetadataRoute } from "next";

// Cho phép "Thêm vào màn hình chính" trên điện thoại, mở như một app riêng
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Threads Bot",
    short_name: "Threads Bot",
    description: "Săn bài viral, viết lại kèm link Shopee, quản lý bot Threads",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f4",
    theme_color: "#141414",
    lang: "vi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
