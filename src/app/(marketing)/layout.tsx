import type { Metadata } from "next";
import { Header } from "@/components/marketing/header";
import { Footer } from "@/components/marketing/footer";

// Autodiscovery del feed RSS delle guide (crawler, aggregatori, AI).
export const metadata: Metadata = {
  alternates: {
    types: {
      "application/rss+xml": "https://scontrinozero.it/feed.xml",
    },
  },
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
