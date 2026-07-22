import { afterEach, describe, expect, it, vi } from "vitest";
import { guideArticles, guideSlugs } from "@/lib/guide/articles";
import { helpSlugs } from "@/lib/help/articles";
import { categorySlugs } from "@/lib/per/categories";
import { toolSlugs } from "@/lib/strumenti/tools";

const mockHeaderGet = vi.fn<(name: string) => string | null>();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: mockHeaderGet }),
}));

async function getResponse(): Promise<Response> {
  const { GET } = await import("./route");
  return GET();
}

describe("GET /llms-full.txt", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockHeaderGet.mockReset();
  });

  it("serves text/plain markdown on the production marketing apex", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const response = await getResponse();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    const body = await response.text();
    expect(body.startsWith("# ScontrinoZero\n")).toBe(true);
  });

  it("includes the FULL text of every guide (sections and FAQ, not just links)", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    for (const slug of guideSlugs) {
      const article = guideArticles[slug];
      expect(body).toContain(`https://scontrinozero.it/guide/${slug}`);
      // Testo completo: ogni sezione col suo body, ogni FAQ con la risposta
      for (const section of article.sections) {
        expect(body).toContain(section.heading);
        expect(body).toContain(section.body);
      }
      for (const faq of article.faq) {
        expect(body).toContain(faq.answer);
      }
    }
  });

  it("renders guide tables as markdown tables", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    // La tabella N1-N7 della guida codici-natura-iva deve esserci riga per riga
    expect(body).toContain("| N2.2 |");
  });

  it("includes categories, tools and confronto content with their FAQ", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    for (const slug of categorySlugs) {
      expect(body).toContain(`https://scontrinozero.it/per/${slug}`);
    }
    for (const slug of toolSlugs) {
      expect(body).toContain(`https://scontrinozero.it/strumenti/${slug}`);
    }
    expect(body).toContain("https://scontrinozero.it/confronto");
  });

  it("lists help articles as links only (prose lives in the page components)", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    for (const slug of helpSlugs) {
      expect(body).toContain(`https://scontrinozero.it/help/${slug}`);
    }
  });

  it("returns 404 on a non-indexable host (sandbox)", async () => {
    mockHeaderGet.mockReturnValue("sandbox.scontrinozero.it");
    const response = await getResponse();

    expect(response.status).toBe(404);
  });

  it("returns 404 when the host header is missing", async () => {
    mockHeaderGet.mockReturnValue(null);
    const response = await getResponse();

    expect(response.status).toBe(404);
  });
});
