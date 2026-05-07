// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  JsonLd,
  softwareApplicationJsonLd,
  organizationJsonLd,
  faqPageJsonLd,
  breadcrumbListJsonLd,
  helpArticleBreadcrumb,
} from "./json-ld";
import { faqItems } from "@/components/marketing/faq-items";

describe("JsonLd component", () => {
  it("renders a script tag with type application/ld+json", () => {
    const data = { "@type": "Test" };
    const html = renderToStaticMarkup(createElement(JsonLd, { data }));
    expect(html).toContain('type="application/ld+json"');
  });

  it("serializes the data as JSON in the script body", () => {
    const data = { "@type": "SoftwareApplication", name: "TestApp" };
    const html = renderToStaticMarkup(createElement(JsonLd, { data }));
    expect(html).toContain('"SoftwareApplication"');
    expect(html).toContain('"TestApp"');
  });

  it("escapes </script> sequences to prevent script-tag breakout", () => {
    const data = {
      name: "</script><script>alert(1)</script>",
    };
    const html = renderToStaticMarkup(createElement(JsonLd, { data }));
    const closings = html.match(/<\/script>/g) ?? [];
    expect(closings.length).toBe(1);
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("escapes < > & even when inside legitimate values", () => {
    const data = { description: "A & B < C > D" };
    const html = renderToStaticMarkup(createElement(JsonLd, { data }));
    expect(html).not.toContain("A & B < C > D");
    expect(html).toContain("\\u0026");
    expect(html).toContain("\\u003c");
    expect(html).toContain("\\u003e");
  });
});

describe("softwareApplicationJsonLd", () => {
  it("has @type SoftwareApplication", () => {
    expect(softwareApplicationJsonLd["@type"]).toBe("SoftwareApplication");
  });

  it("has name ScontrinoZero", () => {
    expect(softwareApplicationJsonLd.name).toBe("ScontrinoZero");
  });

  it("includes at least 2 pricing offers", () => {
    expect(softwareApplicationJsonLd.offers.length).toBeGreaterThanOrEqual(2);
  });

  it("offers use EUR currency", () => {
    for (const offer of softwareApplicationJsonLd.offers) {
      expect(offer.priceCurrency).toBe("EUR");
    }
  });

  it("declares Italian language", () => {
    expect(softwareApplicationJsonLd.inLanguage).toBe("it-IT");
  });

  it("has an absolute https url", () => {
    expect(softwareApplicationJsonLd.url).toMatch(/^https:\/\//);
  });

  it("has a non-empty description", () => {
    expect(softwareApplicationJsonLd.description.length).toBeGreaterThan(20);
  });

  it("has a featureList with at least 4 entries", () => {
    expect(Array.isArray(softwareApplicationJsonLd.featureList)).toBe(true);
    expect(softwareApplicationJsonLd.featureList.length).toBeGreaterThanOrEqual(
      4,
    );
    for (const feature of softwareApplicationJsonLd.featureList) {
      expect(typeof feature).toBe("string");
      expect(feature.length).toBeGreaterThan(0);
    }
  });
});

describe("organizationJsonLd", () => {
  it("has @type Organization", () => {
    expect(organizationJsonLd["@type"]).toBe("Organization");
  });

  it("has name ScontrinoZero", () => {
    expect(organizationJsonLd.name).toBe("ScontrinoZero");
  });

  it("has a url", () => {
    expect(organizationJsonLd.url).toBeTruthy();
  });

  it("has an absolute https logo URL", () => {
    expect(organizationJsonLd.logo).toMatch(/^https:\/\//);
  });

  it("includes sameAs with at least one absolute URL", () => {
    expect(Array.isArray(organizationJsonLd.sameAs)).toBe(true);
    expect(organizationJsonLd.sameAs.length).toBeGreaterThanOrEqual(1);
    for (const url of organizationJsonLd.sameAs) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it("has a contactPoint with email matching CONTACT_EMAIL", async () => {
    const { CONTACT_EMAIL } = await import("@/lib/contact");
    expect(organizationJsonLd.contactPoint["@type"]).toBe("ContactPoint");
    expect(organizationJsonLd.contactPoint.email).toBe(CONTACT_EMAIL);
    expect(organizationJsonLd.contactPoint.contactType).toBeTruthy();
  });

  it("declares Italian as available language", () => {
    expect(organizationJsonLd.contactPoint.availableLanguage).toContain(
      "Italian",
    );
  });
});

describe("faqPageJsonLd", () => {
  it("has @type FAQPage", () => {
    expect(faqPageJsonLd["@type"]).toBe("FAQPage");
  });

  it("includes all FAQ entries from faqItems", () => {
    expect(faqPageJsonLd.mainEntity.length).toBe(faqItems.length);
  });

  it("each entry has @type Question", () => {
    for (const entry of faqPageJsonLd.mainEntity) {
      expect(entry["@type"]).toBe("Question");
    }
  });

  it("each entry has a name and acceptedAnswer", () => {
    for (const entry of faqPageJsonLd.mainEntity) {
      expect(entry.name).toBeTruthy();
      expect(entry.acceptedAnswer.text).toBeTruthy();
    }
  });
});

describe("breadcrumbListJsonLd", () => {
  it("has @type BreadcrumbList and @context schema.org", () => {
    const ld = breadcrumbListJsonLd([
      { name: "Home", url: "https://scontrinozero.it" },
      { name: "Help", url: "https://scontrinozero.it/help" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld["@context"]).toBe("https://schema.org");
  });

  it("emits ListItem entries with sequential positions starting at 1", () => {
    const ld = breadcrumbListJsonLd([
      { name: "Home", url: "https://scontrinozero.it" },
      { name: "Help", url: "https://scontrinozero.it/help" },
      {
        name: "Aliquote IVA",
        url: "https://scontrinozero.it/help/aliquote-iva",
      },
    ]);
    expect(ld.itemListElement).toHaveLength(3);
    ld.itemListElement.forEach((entry, i) => {
      expect(entry["@type"]).toBe("ListItem");
      expect(entry.position).toBe(i + 1);
      expect(entry.name).toBeTruthy();
      expect(entry.item).toMatch(/^https:\/\//);
    });
  });

  it("rejects empty input", () => {
    expect(() => breadcrumbListJsonLd([])).toThrow();
  });
});

describe("helpArticleBreadcrumb", () => {
  it("produces a 3-level breadcrumb (Home → Help Center → article)", () => {
    const ld = helpArticleBreadcrumb("aliquote-iva", "Aliquote IVA");
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[0].name).toBe("Home");
    expect(ld.itemListElement[1].name).toBe("Help Center");
    expect(ld.itemListElement[2].name).toBe("Aliquote IVA");
  });

  it("article URL contains the slug under /help", () => {
    const ld = helpArticleBreadcrumb(
      "regime-forfettario",
      "Regime forfettario",
    );
    expect(ld.itemListElement[2].item).toBe(
      "https://scontrinozero.it/help/regime-forfettario",
    );
  });

  it("Home and Help Center URLs are absolute https", () => {
    const ld = helpArticleBreadcrumb("primo-scontrino", "Primo scontrino");
    expect(ld.itemListElement[0].item).toBe("https://scontrinozero.it");
    expect(ld.itemListElement[1].item).toBe("https://scontrinozero.it/help");
  });

  it("rejects empty slug or empty name", () => {
    expect(() => helpArticleBreadcrumb("", "Title")).toThrow();
    expect(() => helpArticleBreadcrumb("slug", "")).toThrow();
  });
});
