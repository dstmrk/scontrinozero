import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { signOut } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { PwaInstallPrompt } from "@/components/pwa/install-prompt";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if onboarding is complete
  const status = await getOnboardingStatus();
  if (!status.hasBusiness || !status.hasCredentials) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <Link
            href="/dashboard"
            className="text-primary flex items-center gap-2 text-lg font-bold"
          >
            <Image src="/logo.png" alt="ScontrinoZero" width={20} height={20} />
            ScontrinoZero
          </Link>

          <form action={signOut} className="md:hidden">
            <Button variant="ghost" size="icon" type="submit" aria-label="Esci">
              <LogOut className="h-5 w-5" />
            </Button>
          </form>

          <nav className="hidden items-center gap-4 md:flex">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/cassa"
              className="text-muted-foreground hover:text-foreground text-sm font-medium"
            >
              Cassa
            </Link>
            <Link
              href="/dashboard/storico"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Storico
            </Link>
            <Link
              href="/dashboard/settings"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Impostazioni
            </Link>

            <form action={signOut}>
              <Button variant="ghost" size="sm" type="submit">
                Esci
              </Button>
            </form>
          </nav>
        </div>
      </header>

      <main className="container mx-auto flex-1 px-4 py-6 pb-20 md:pb-6">
        {children}
      </main>

      <BottomNav />
      <PwaInstallPrompt />
    </div>
  );
}
