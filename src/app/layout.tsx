import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import {
  JsonLd,
  softwareApplicationJsonLd,
  organizationJsonLd,
} from "@/components/json-ld";
import { marketingBaseUrl } from "@/lib/seo-indexable";
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
  robots: {
    index: true,
    follow: true,
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${nunitoSans.variable} ${geistMono.variable} antialiased`}
      >
        <JsonLd data={softwareApplicationJsonLd} />
        <JsonLd data={organizationJsonLd} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
