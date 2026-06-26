import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { LogOut, Settings } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { signOut } from "@/server/auth-actions";
import { getAnnouncement } from "@/lib/announcement";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { HeaderNav } from "@/components/dashboard/header-nav";
import { AnnouncementBanner } from "@/components/announcement/announcement-banner";
import { PwaInstallPrompt } from "@/components/pwa/install-prompt";
import { PartnerBrandSuffix } from "@/components/partner-brand-suffix";

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

  const announcement = getAnnouncement();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="flex min-h-screen flex-col">
        {announcement && <AnnouncementBanner {...announcement} />}
        <header className="bg-background border-b">
          <div className="container mx-auto flex items-center justify-between px-4 py-3">
            <Link
              href="/dashboard"
              className="text-primary flex items-center gap-2 text-lg font-bold"
            >
              <Image
                src="/logo.png"
                alt="ScontrinoZero"
                width={20}
                height={20}
              />
              ScontrinoZero
              <PartnerBrandSuffix />
            </Link>

            <div className="flex items-center md:hidden">
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Impostazioni"
              >
                <Link href="/dashboard/settings">
                  <Settings className="h-5 w-5" />
                </Link>
              </Button>
              <form action={signOut}>
                <Button
                  variant="ghost"
                  size="icon"
                  type="submit"
                  aria-label="Esci"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </form>
            </div>

            <nav className="hidden items-center gap-4 md:flex">
              <HeaderNav />

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
    </ThemeProvider>
  );
}
