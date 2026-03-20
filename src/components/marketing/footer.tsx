import Link from "next/link";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import { VAT_NUMBER } from "@/lib/contact";

export function Footer() {
  return (
    <footer className="border-border/50 border-t">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="ScontrinoZero"
                width={20}
                height={20}
              />
              <span className="text-lg font-bold">ScontrinoZero</span>
            </div>
            <p className="text-muted-foreground mt-2 text-sm">
              Il registratore di cassa virtuale per micro-attività italiane.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Info</h3>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>
                <Link
                  href="/#funzionalita"
                  className="hover:text-foreground transition-colors"
                >
                  Funzionalità
                </Link>
              </li>
              <li>
                <Link
                  href="/#prezzi"
                  className="hover:text-foreground transition-colors"
                >
                  Prezzi
                </Link>
              </li>
              <li>
                <Link
                  href="/#faq"
                  className="hover:text-foreground transition-colors"
                >
                  Domande Frequenti
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Legale</h3>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>
                <Link
                  href="/privacy"
                  className="hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/termini"
                  className="hover:text-foreground transition-colors"
                >
                  Termini e Condizioni
                </Link>
              </li>
              <li>
                <Link
                  href="/cookie-policy"
                  className="hover:text-foreground transition-colors"
                >
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="text-muted-foreground flex flex-col items-center justify-between gap-4 text-xs sm:flex-row">
          <p>
            &copy; {new Date().getFullYear()} ScontrinoZero &mdash; P.IVA{" "}
            {VAT_NUMBER}
          </p>
          <p>
            Open source su{" "}
            <a
              href="https://github.com/dstmrk/scontrinozero"
              className="hover:text-foreground underline transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
