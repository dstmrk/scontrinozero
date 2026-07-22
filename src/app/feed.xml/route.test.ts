import { afterEach, describe, expect, it, vi } from "vitest";
import { guideArticles, guideSlugs } from "@/lib/guide/articles";

const mockHeaderGet = vi.fn<(name: string) => string | null>();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: mockHeaderGet }),
}));

async function getResponse(): Promise<Response> {
  const { GET } = await import("./route");
  return GET();
}

describe("GET /feed.xml", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockHeaderGet.mockReset();
  });

  it("serves an RSS 2.0 feed on the production marketing apex", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const response = await getResponse();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/rss+xml; charset=utf-8",
    );
    const body = await response.text();
    expect(body).toContain('<rss version="2.0"');
    expect(body).toContain("<language>it-it</language>");
  });

  it("has one item per guide with canonical link and pubDate", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    const itemCount = (body.match(/<item>/g) ?? []).length;
    expect(itemCount).toBe(guideSlugs.length);
    for (const slug of guideSlugs) {
      expect(body).toContain(
        `<link>https://scontrinozero.it/guide/${slug}</link>`,
      );
    }
    // pubDate in formato RFC 822 (richiesto da RSS 2.0)
    expect(body).toMatch(/<pubDate>\w{3}, \d{2} \w{3} \d{4}/);
  });

  it("escapes XML entities in titles and descriptions", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    // Nessun & nudo fuori dalle entity: il feed deve restare XML valido
    const raw = body.replaceAll(/&(amp|lt|gt|quot|apos);/g, "");
    expect(raw).not.toContain("&");
  });

  it("orders items by publishedAt descending (newest first)", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    const links = [
      ...body.matchAll(/<link>([^<]+\/guide\/[^<]+)<\/link>/g),
    ].map((m) => m[1]);
    const dates = links.map((link) => {
      const slug = link.split("/guide/")[1] as (typeof guideSlugs)[number];
      return guideArticles[slug].publishedAt;
    });
    const sorted = [...dates].toSorted((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("returns 404 on a non-indexable host", async () => {
    mockHeaderGet.mockReturnValue("sandbox.scontrinozero.it");
    const response = await getResponse();

    expect(response.status).toBe(404);
  });
});
