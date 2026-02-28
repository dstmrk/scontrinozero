import Link from "next/link";
import { ReceiptEuro } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="border-border/50 sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <ReceiptEuro className="text-primary h-5 w-5" />
          <span className="text-lg font-bold">ScontrinoZero</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          <a
            href="#funzionalita"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Funzionalità
          </a>
          <a
            href="#prezzi"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Piani
          </a>
          <a
            href="#faq"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            FAQ
          </a>
        </nav>

        <Button size="sm" asChild>
          <a href="#waitlist">Lista d&apos;attesa</a>
        </Button>
      </div>
    </header>
  );
}
