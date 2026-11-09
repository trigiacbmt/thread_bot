// Trang công khai (không cần đăng nhập): chính sách quyền riêng tư, xoá dữ liệu — dùng cho hồ sơ Meta App Review.
import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2.5 px-4 font-semibold">
          <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg">@</span>
          {process.env.APP_NAME || "Threads Bot"}
          <nav className="text-muted-foreground ml-auto flex gap-4 text-sm font-normal">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/data-deletion" className="hover:text-foreground">Data deletion</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 text-[15px] leading-relaxed md:py-12
        [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight md:[&_h1]:text-3xl
        [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold
        [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6
        [&_a]:underline [&_a]:underline-offset-4 [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:text-sm">
        {children}
      </main>
    </div>
  );
}
