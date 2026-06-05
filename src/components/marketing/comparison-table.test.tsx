// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ComparisonTable, type ComparisonRow } from "./comparison-table";

const rows: readonly ComparisonRow[] = [
  { label: "Canone mensile", competitor: "€19", ours: "€4,99" },
  {
    label: "Trial senza carta",
    competitor: false,
    ours: true,
    note: "30 giorni",
  },
];

describe("ComparisonTable", () => {
  it("dà scope=col a ogni intestazione di colonna (td-has-header)", () => {
    render(<ComparisonTable competitorLabel="Concorrente" rows={rows} />);
    const colHeaders = screen.getAllByRole("columnheader");
    // Tre colonne: etichetta vuota, concorrente, ScontrinoZero.
    expect(colHeaders).toHaveLength(3);
    for (const th of colHeaders) {
      expect(th.getAttribute("scope")).toBe("col");
    }
  });

  it("rende la prima cella di ogni riga come row header (th scope=row)", () => {
    render(<ComparisonTable competitorLabel="Concorrente" rows={rows} />);
    const rowHeaders = screen.getAllByRole("rowheader");
    const labels = rowHeaders.map((th) => th.getAttribute("scope"));
    expect(labels.every((s) => s === "row")).toBe(true);
    // Le etichette di riga restano i row header.
    expect(
      screen.getByRole("rowheader", { name: /canone mensile/i }),
    ).toBeTruthy();
  });

  it("rende il footer label come row header quando presente", () => {
    render(
      <ComparisonTable
        competitorLabel="Concorrente"
        rows={rows}
        footer={{ label: "Risparmio annuo", value: "€168" }}
      />,
    );
    const footerHeader = screen.getByRole("rowheader", {
      name: /risparmio annuo/i,
    });
    expect(footerHeader.getAttribute("scope")).toBe("row");
  });

  it("preserva il contenuto delle celle dati (valori e note)", () => {
    render(
      <ComparisonTable
        competitorLabel="Concorrente"
        rows={rows}
        oursLabel="ScontrinoZero"
      />,
    );
    expect(screen.getByText("€4,99")).toBeTruthy();
    expect(screen.getByText("30 giorni")).toBeTruthy();
    // La riga "Trial" booleana rende un'icona (check) nella cella nostra.
    const trialRow = screen
      .getByRole("rowheader", { name: /trial senza carta/i })
      .closest("tr")!;
    expect(within(trialRow).getAllByRole("cell").length).toBeGreaterThan(0);
  });
});
