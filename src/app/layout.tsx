import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
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
  display: "swap",
});

const geistMono = localFont({
  src: "../fonts/geist-mono-latin-wght-normal.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ScontrinoZero — Scontrini elettronici dal tuo smartphone",
    template: "%s | ScontrinoZero",
  },
  description:
    "Registratore di cassa virtuale per micro-attività. Emetti scontrini elettronici e trasmetti i corrispettivi all'Agenzia delle Entrate senza registratore telematico. Il più economico del mercato.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://scontrinozero.it",
  ),
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "ScontrinoZero",
    title: "ScontrinoZero — Scontrini elettronici dal tuo smartphone",
    description:
      "Emetti scontrini elettronici e trasmetti i corrispettivi all'AdE senza registratore telematico. Da €0/mese.",
  },
  robots: {
    index: true,
    follow: true,
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
