"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appHref } from "@/lib/marketing-to-app-href";

const navLinks = [
  { href: "/funzionalita", label: "Funzionalità" },
  { href: "/prezzi", label: "Prezzi" },
  { href: "/confronto", label: "Confronto" },
  { href: "/guide", label: "Guide" },
  { href: "/help", label: "Help" },
] as const;

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-border/50 sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2"
          onClick={() => setMobileOpen(false)}
        >
          <Image src="/logo.png" alt="ScontrinoZero" width={20} height={20} />
          <span className="text-lg font-bold">ScontrinoZero</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Plain <a> per forzare hard cross-origin navigation verso il
              subdomain app: i <Link> di Next farebbero soft routing restando
              sul dominio marketing. Vedi src/lib/marketing-to-app-href.ts. */}
          <Button size="sm" asChild className="hidden sm:inline-flex">
            <a href={appHref("/login")}>Accedi</a>
          </Button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors md:hidden"
            aria-label={
              mobileOpen
                ? "Chiudi menu di navigazione"
                : "Apri menu di navigazione"
            }
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-nav"
          className="border-border/50 bg-background border-t md:hidden"
        >
          <ul className="mx-auto max-w-5xl px-4 py-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-foreground hover:bg-muted block rounded-md px-2 py-2 text-sm transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="sm:hidden">
              <a
                href={appHref("/login")}
                onClick={() => setMobileOpen(false)}
                className="text-foreground hover:bg-muted block rounded-md px-2 py-2 text-sm font-medium transition-colors"
              >
                Accedi
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
