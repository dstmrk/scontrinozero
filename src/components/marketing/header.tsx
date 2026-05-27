import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { appHref } from "@/lib/marketing-to-app-href";

export function Header() {
  return (
    <header className="border-border/50 sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="ScontrinoZero" width={20} height={20} />
          <span className="text-lg font-bold">ScontrinoZero</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          <Link
            href="/funzionalita"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Funzionalità
          </Link>
          <Link
            href="/prezzi"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Prezzi
          </Link>
          <Link
            href="/#faq"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            FAQ
          </Link>
        </nav>

        <Button size="sm" asChild>
          {/* Plain <a> per forzare hard cross-origin navigation verso il
              subdomain app: i <Link> di Next farebbero soft routing restando
              sul dominio marketing. Vedi src/lib/marketing-to-app-href.ts. */}
          <a href={appHref("/login")}>Accedi</a>
        </Button>
      </div>
    </header>
  );
}
