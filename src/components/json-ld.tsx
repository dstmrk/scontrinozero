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

export interface ServiceJsonLdInput {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly audience: string;
  readonly areaServed?: string;
  readonly serviceType?: string;
}

export function serviceJsonLd(input: ServiceJsonLdInput) {
  if (!input.name) throw new Error("serviceJsonLd: name is required");
  if (!input.description)
    throw new Error("serviceJsonLd: description is required");
  if (!input.url) throw new Error("serviceJsonLd: url is required");
  if (!input.audience) throw new Error("serviceJsonLd: audience is required");
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    url: input.url,
    areaServed: input.areaServed ?? "IT",
    serviceType: input.serviceType ?? "Registratore di cassa virtuale",
    provider: organizationJsonLd,
    audience: {
      "@type": "Audience" as const,
      audienceType: input.audience,
    },
  } as const;
}

export interface WebApplicationJsonLdInput {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly applicationCategory?: string;
}

export function webApplicationJsonLd(input: WebApplicationJsonLdInput) {
  if (!input.name) throw new Error("webApplicationJsonLd: name is required");
  if (!input.description)
    throw new Error("webApplicationJsonLd: description is required");
  if (!input.url) throw new Error("webApplicationJsonLd: url is required");
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: input.name,
    description: input.description,
    url: input.url,
    applicationCategory: input.applicationCategory ?? "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "it-IT",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer" as const,
      price: "0",
      priceCurrency: "EUR",
    },
    provider: organizationJsonLd,
  } as const;
}

export function guideArticleBreadcrumb(slug: string, name: string) {
  if (!slug) throw new Error("guideArticleBreadcrumb: slug is required");
  if (!name) throw new Error("guideArticleBreadcrumb: name is required");
  return breadcrumbListJsonLd([
    { name: "Home", url: SITE_URL },
    { name: "Guide", url: `${SITE_URL}/guide` },
    { name, url: `${SITE_URL}/guide/${slug}` },
  ]);
}

export interface ArticleJsonLdInput {
  readonly headline: string;
  readonly description: string;
  readonly url: string;
  readonly datePublished: string;
  readonly dateModified: string;
  readonly authorName?: string;
  readonly publisherName?: string;
  readonly publisherLogoUrl?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function articleJsonLd(input: ArticleJsonLdInput) {
  if (!input.headline) throw new Error("articleJsonLd: headline is required");
  if (input.headline.length > 110) {
    throw new Error(
      "articleJsonLd: headline must be ≤ 110 chars (Google rich result limit)",
    );
  }
  if (!input.description) {
    throw new Error("articleJsonLd: description is required");
  }
  if (!input.url) throw new Error("articleJsonLd: url is required");
  if (!input.url.startsWith("https://")) {
    throw new Error("articleJsonLd: url must be absolute HTTPS");
  }
  if (!ISO_DATE_RE.test(input.datePublished)) {
    throw new Error("articleJsonLd: datePublished must be YYYY-MM-DD");
  }
  if (!ISO_DATE_RE.test(input.dateModified)) {
    throw new Error("articleJsonLd: dateModified must be YYYY-MM-DD");
  }
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    url: input.url,
    mainEntityOfPage: input.url,
    inLanguage: "it-IT",
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: {
      "@type": "Organization" as const,
      name: input.authorName ?? "Team ScontrinoZero",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization" as const,
      name: input.publisherName ?? "ScontrinoZero",
      logo: {
        "@type": "ImageObject" as const,
        url: input.publisherLogoUrl ?? `${SITE_URL}/logo.png`,
      },
    },
  } as const;
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
