import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { signOut } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";

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
  if (!status.hasBusiness) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-primary text-lg font-bold">
            ScontrinoZero
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Dashboard
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

      <main className="container mx-auto flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
