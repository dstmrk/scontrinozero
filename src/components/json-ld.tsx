import { CONTACT_EMAIL } from "@/lib/contact";
import { faqItems } from "@/components/marketing/faq-items";

/**
 * Escapa i caratteri pericolosi nel JSON-LD per evitare che payload contenenti
 * `</script>` (anche se solo indirettamente, via dati editoriali futuri) chiudano
 * prematuramente lo script tag e introducano XSS riflesso. Defense in depth
 * attiva oggi su payload statici, obbligatoria quando arriveranno route dinamiche.
 */
function safeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replaceAll("<", String.raw`\u003c`)
    .replaceAll(">", String.raw`\u003e`)
    .replaceAll("&", String.raw`\u0026`);
}

export function JsonLd({ data }: { readonly data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
    />
  );
}

const SITE_URL = "https://scontrinozero.it";

export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ScontrinoZero",
  url: SITE_URL,
  inLanguage: "it-IT",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  description:
    "Registratore di cassa virtuale per partite IVA: emetti scontrini elettronici e trasmetti i corrispettivi all'Agenzia delle Entrate dal cellulare, senza registratore telematico fisico.",
  featureList: [
    "Emissione scontrino elettronico in 5 secondi",
    "Trasmissione automatica all'Agenzia delle Entrate",
    "Annullamento scontrino conforme",
    "Lotteria degli Scontrini",
    "Multi-metodo di pagamento (contanti, carte, misti)",
    "Storico scontrini ed esportazione",
    "App installabile (PWA) su iOS e Android",
  ],
  offers: [
    {
      "@type": "Offer",
      name: "Starter",
      price: "4.99",
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "8.99",
      priceCurrency: "EUR",
    },
  ],
} as const;

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ScontrinoZero",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  sameAs: ["https://github.com/dstmrk"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: CONTACT_EMAIL,
    availableLanguage: ["Italian"],
  },
} as const;

export interface BreadcrumbItem {
  readonly name: string;
  readonly url: string;
}

export function breadcrumbListJsonLd(items: readonly BreadcrumbItem[]) {
  if (items.length === 0) {
    throw new Error("breadcrumbListJsonLd requires at least one item");
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem" as const,
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  } as const;
}

export function helpArticleBreadcrumb(slug: string, name: string) {
  if (!slug) throw new Error("helpArticleBreadcrumb: slug is required");
  if (!name) throw new Error("helpArticleBreadcrumb: name is required");
  return breadcrumbListJsonLd([
    { name: "Home", url: SITE_URL },
    { name: "Help Center", url: `${SITE_URL}/help` },
    { name, url: `${SITE_URL}/help/${slug}` },
  ]);
}

export const faqPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question" as const,
    name: item.question,
    acceptedAnswer: { "@type": "Answer" as const, text: item.answer },
  })),
};
