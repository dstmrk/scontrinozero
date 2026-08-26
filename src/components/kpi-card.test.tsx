import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./kpi-card";

describe("KpiCard", () => {
  it("mostra etichetta e valore", () => {
    render(<KpiCard title="Ricavi" value="1.234,56 €" />);

    expect(screen.getByText("Ricavi")).toBeInTheDocument();
    expect(screen.getByText("1.234,56 €")).toBeInTheDocument();
  });

  it("omette la riga di contesto quando non è passata", () => {
    const { container } = render(<KpiCard title="Ricavi" value="0 €" />);

    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("mostra la riga di contesto quando è passata", () => {
    render(<KpiCard title="Ricavi" value="0 €" footnote="10 in totale" />);

    expect(screen.getByText("10 in totale")).toBeInTheDocument();
  });

  it("rende lo slot children in coda al contenuto", () => {
    render(
      <KpiCard title="Ricavi" value="0 €">
        <span data-testid="extra" />
      </KpiCard>,
    );

    expect(screen.getByTestId("extra")).toBeInTheDocument();
  });
});
