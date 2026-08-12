import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { LogOut, Settings } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getOnboardingStatus,
  getOnboardingTourSeen,
} from "@/server/onboarding-actions";
import { signOut } from "@/server/auth-actions";
import { getAnnouncement } from "@/lib/announcement";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { HeaderNav } from "@/components/dashboard/header-nav";
import { OnboardingTour } from "@/components/dashboard/onboarding-tour";
import { AnnouncementBanner } from "@/components/announcement/announcement-banner";
import { PwaInstallPrompt } from "@/components/pwa/install-prompt";
import { PartnerBrandSuffix } from "@/components/partner-brand-suffix";

// Solo l'app shell va edge-to-edge: il marketing resta sul viewport di default.
// Motivazione in src/lib/pwa/viewport.ts.
//
// Re-export diretto (S3559). Next legge `mod.viewport` dal namespace del modulo
// a runtime (`resolve-metadata.js`) e nessun path di analisi statica guarda
// questo export, quindi la forma `export … from` è equivalente a un binding
// locale — verificato nel Next installato prima di adottarla.
export { dashboardViewport as viewport } from "@/lib/pwa/viewport";

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

  // Onboarding tour: mostrato una sola volta al primo accesso (PLAN.md v1.4.1).
  // Letto server-side → niente flash dell'overlay. Degrada a "visto" su errore
  // DB (la funzione gestisce il fallback), quindi non blocca mai il dashboard.
  const tourSeen = await getOnboardingTourSeen();

  const announcement = getAnnouncement();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {/*
        Inset orizzontali sullo shell: con viewport-fit=cover il layout arriva
        al bordo fisico, quindi in landscape su telefoni col notch il contenuto
        finirebbe sotto il ritaglio. Le bande laterali restano invisibili — il
        body ha lo stesso `bg-background`. In portrait valgono 0.
      */}
      <div className="flex min-h-screen flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
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
                <Link
                  href="/dashboard/settings"
                  data-tour-step="settings-mobile"
                >
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

            <nav
              data-tour-nav="desktop"
              className="hidden items-center gap-4 md:flex"
            >
              <HeaderNav />

              <form action={signOut}>
                <Button variant="ghost" size="sm" type="submit">
                  Esci
                </Button>
              </form>
            </nav>
          </div>
        </header>

        {/*
          La bottom nav è alta h-16 e cresce della safe-area inset: senza
          sommarla qui il fondo del contenuto finirebbe sotto la nav esattamente
          sui telefoni con home indicator. Il 5rem è il vecchio pb-20 (64px di
          nav + 16px d'aria).

          Da `md` la nav è nascosta, ma la inset va sommata lo stesso: con
          viewport-fit=cover il layout arriva al bordo fisico anche su un iPad
          installato come PWA, dove prima iOS riservava quella fascia da solo.
          Con il solo `pb-6` l'ultima riga finirebbe a filo della home indicator.
        */}
        <main className="container mx-auto flex-1 px-4 py-6 pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-[calc(1.5rem_+_env(safe-area-inset-bottom))]">
          {children}
        </main>

        <BottomNav />
        <PwaInstallPrompt />
        {!tourSeen && <OnboardingTour />}
      </div>
    </ThemeProvider>
  );
}
