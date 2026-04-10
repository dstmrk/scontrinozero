// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  JsonLd,
  softwareApplicationJsonLd,
  organizationJsonLd,
  faqPageJsonLd,
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
