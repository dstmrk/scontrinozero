import type { Metadata } from "next";
import localFont from "next/font/local";
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
  title: "ScontrinoZero",
  description:
    "Registratore di cassa virtuale. Emetti scontrini elettronici dal tuo smartphone.",
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
        {children}
      </body>
    </html>
  );
}
