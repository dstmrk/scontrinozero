import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { HelpArticleUpdatedAt, formatUpdatedAt } from "./article-updated-at";
import { helpArticles, helpSlugs } from "@/lib/help/articles";

describe("formatUpdatedAt", () => {
  it("formatta la data ISO come «mese aaaa» in italiano", () => {
    expect(formatUpdatedAt("2026-08-02")).toBe("agosto 2026");
  });

  it("copre tutti i mesi senza cadere su undefined", () => {
    const mesi = [
      "gennaio",
      "febbraio",
      "marzo",
      "aprile",
      "maggio",
      "giugno",
      "luglio",
      "agosto",
      "settembre",
      "ottobre",
      "novembre",
      "dicembre",
    ];
    for (const [i, mese] of mesi.entries()) {
      const mm = String(i + 1).padStart(2, "0");
      expect(formatUpdatedAt(`2026-${mm}-15`)).toBe(`${mese} 2026`);
    }
  });

  it("non usa il fuso orario locale (niente shift al giorno prima)", () => {
    // Una data col giorno 01 parsata come Date locale in un fuso negativo
    // ricadrebbe nel mese precedente: il formatter lavora sulla stringa.
    expect(formatUpdatedAt("2026-03-01")).toBe("marzo 2026");
  });
});

describe("HelpArticleUpdatedAt", () => {
  it("mostra il dateModified del registry, non una data hardcoded", () => {
    const { container } = render(
      <HelpArticleUpdatedAt slug="normativa-pos-2026" />,
    );
    const iso = helpArticles["normativa-pos-2026"]!.dateModified;
    const time = container.querySelector("time");
    expect(time).toHaveTextContent(formatUpdatedAt(iso));
    expect(time).toHaveAttribute("dateTime", iso);
  });

  it("resta allineato al registry per ogni slug help", () => {
    for (const slug of helpSlugs) {
      const { container, unmount } = render(
        <HelpArticleUpdatedAt slug={slug} />,
      );
      const iso = helpArticles[slug]!.dateModified;
      expect(container.querySelector("time")).toHaveTextContent(
        formatUpdatedAt(iso),
      );
      unmount();
    }
  });

  it("lancia su uno slug sconosciuto invece di renderizzare una data vuota", () => {
    expect(() =>
      render(<HelpArticleUpdatedAt slug="slug-inesistente" />),
    ).toThrow(/Unknown help article slug/);
  });
});
