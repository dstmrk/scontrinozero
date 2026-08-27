import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import {
  JsonLd,
  softwareApplicationJsonLd,
  organizationJsonLd,
  webSiteJsonLd,
} from "@/components/json-ld";
import { marketingBaseUrl } from "@/lib/seo-indexable";
import { UmamiScript } from "@/components/umami-script";
import "./globals.css";

const nunitoSans = localFont({
  src: [
    {
      path: "../fonts/nunito-sans-latin-wght-normal.woff2",
      style: "normal",
    },
    {
      path: "../fonts/nunito-sans-latin-wght-italic.woff2",
      style: "italic",
    },
  ],
  variable: "--font-nunito-sans",
  display: "optional",
});

const geistMono = localFont({
  src: "../fonts/geist-mono-latin-wght-normal.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default:
      "ScontrinoZero — Scontrino Elettronico senza Registratore di Cassa",
    template: "%s | ScontrinoZero",
  },
  description:
    "Registratore di cassa virtuale per micro-attività. Emetti scontrini elettronici e trasmetti i corrispettivi all'Agenzia delle Entrate senza registratore telematico. Il più economico del mercato: da €29,99/anno.",
  // Base per la risoluzione di URL relativi (es. OG image): apex marketing
  // indicizzabile, non il dominio app.
  metadataBase: new URL(marketingBaseUrl()),
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "ScontrinoZero",
    title: "ScontrinoZero — Scontrino Elettronico senza Registratore di Cassa",
    description:
      "Emetti scontrini elettronici e trasmetti i corrispettivi all'AdE senza registratore telematico. Da €29,99/anno, 30 giorni gratis.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ScontrinoZero — Scontrino Elettronico senza Registratore di Cassa",
    description:
      "Emetti scontrini elettronici e trasmetti i corrispettivi all'AdE senza registratore telematico. Da €29,99/anno, 30 giorni gratis.",
  },
  // Google non espone un opt-out dedicato per AI Overviews e AI Mode: la
  // comparsa in quelle superfici e la lunghezza del passaggio citato sono
  // governate dalle direttive preview standard (`max-snippet`,
  // `max-image-preview`, `nosnippet`). Restare sul default significa lasciare
  // a Google il taglio dello snippet proprio sul contenuto che la checklist
  // GEO della skill `marketing-content` esiste per rendere citabile.
  // `-1` = nessun limite; `large` = anteprima immagine piena.
  robots: {
    index: true,
    follow: true,
    "max-snippet": -1,
    "max-image-preview": "large",
    "max-video-preview": -1,
  },
  // `<meta name="format-detection" content="telephone=no">`. Senza, i data
  // detectors di Safari su iPhone riscrivono ogni digit-run lungo in
  // `<a href="tel:…" x-apple-data-detectors="true">` mentre il documento viene
  // parsato — cioè prima che React idrati, che quindi trova un `<a>` dove
  // l'HTML del server aveva un text node. Il mismatch è reale (React si
  // ripara ri-renderizzando, ma il primo paint si butta) ed è iPhone-only:
  // Safari su macOS il phone detection non lo fa (SCONTRINOZERO-Y, 6 eventi
  // su `/` da 6 città diverse, 100% Mobile Safari).
  //
  // Sta nel root layout e non nel gruppo `(marketing)` perché il bersaglio non
  // è solo la P.IVA in footer: la stessa riscrittura prende il `documentId`
  // sulla ricevuta pubblica `/r/[documentId]` e la P.IVA in onboarding e
  // settings, dove un numero che diventa un pulsante "chiama" è un bug UX
  // anche a hydration a posto.
  //
  // Solo `telephone`: `date`/`address`/`email` sono detector che Safari non
  // applica di default, dichiararli sarebbe config per un caso ipotetico.
  formatDetection: {
    telephone: false,
  },
  other: {
    // Standard cross-browser (sostituisce l'`apple-mobile-web-app-capable`
    // deprecato; quest'ultimo resta per compat con iOS Safari datati).
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "ScontrinoZero",
  },
};

// Il segmento /dashboard lo sovrascrive con la coppia light/dark: Next fonde i
// viewport lungo l'albero, il figlio vince sul campo che ridichiara.
// Sulla forma `export … from` vedi la nota in src/app/dashboard/layout.tsx.
export { rootViewport as viewport } from "@/lib/pwa/viewport";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body
        className={`${nunitoSans.variable} ${geistMono.variable} antialiased`}
      >
        <JsonLd data={softwareApplicationJsonLd} />
        <JsonLd data={organizationJsonLd} />
        <JsonLd data={webSiteJsonLd} />
        <UmamiScript />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
