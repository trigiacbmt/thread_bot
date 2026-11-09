import { config } from "@/lib/config";
import { currentUser } from "@/lib/session";
import { LoginForm } from "@/components/LoginForm";
import { Providers } from "@/components/client";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) return <LoginForm adminKeyEnabled={Boolean(config.adminKey)} />;
  return (
    <Providers>
      <Shell user={user}>{children}</Shell>
    </Providers>
  );
}
