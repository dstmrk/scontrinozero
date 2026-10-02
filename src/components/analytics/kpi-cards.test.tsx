import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCards } from "./kpi-cards";

describe("KpiCards", () => {
  it("formats currency values with euro and Italian locale", () => {
    render(
      <KpiCards
        kpis={{
          revenueCents: 123456,
          count: 42,
          aovCents: 2938,
          voidCount: 3,
          returnCount: 0,
          returnCents: 0,
        }}
      />,
    );
    // Tollera Node senza ICU full (no separatore migliaia: "1234,56 €") e
    // ambienti browser/CI con ICU completo ("1.234,56 €").
    expect(screen.getByText(/1\.?234,56/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/29,38/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders em-dash for empty datasets instead of NaN €", () => {
    render(
      <KpiCards
        kpis={{
          revenueCents: 0,
          count: 0,
          aovCents: 0,
          voidCount: 0,
          returnCount: 0,
          returnCents: 0,
        }}
      />,
    );
    // Three monetary cards (revenue, AOV) + two counts; the dash placeholder
    // applies to the AOV when count is 0 to avoid showing "0,00 €" as if it
    // were a meaningful number.
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("renders all four KPI titles", () => {
    render(
      <KpiCards
        kpis={{
          revenueCents: 0,
          count: 0,
          aovCents: 0,
          voidCount: 0,
          returnCount: 0,
          returnCents: 0,
        }}
      />,
    );
    expect(screen.getByText(/ricavi/i)).toBeInTheDocument();
    expect(screen.getByText(/scontrini emessi/i)).toBeInTheDocument();
    expect(screen.getByText(/scontrino medio/i)).toBeInTheDocument();
    expect(screen.getByText(/scontrini annullati/i)).toBeInTheDocument();
  });

  it("dice di quanto i ricavi sono al netto dei resi", () => {
    render(
      <KpiCards
        kpis={{
          revenueCents: 3750,
          count: 2,
          aovCents: 2500,
          voidCount: 0,
          returnCount: 1,
          returnCents: 1250,
        }}
      />,
    );
    expect(screen.getByText(/Al netto di 1 reso \(12,50/)).toBeInTheDocument();
  });

  it("al plurale con più resi, e nessuna nota senza resi", () => {
    const { rerender } = render(
      <KpiCards
        kpis={{
          revenueCents: 100,
          count: 1,
          aovCents: 100,
          voidCount: 0,
          returnCount: 2,
          returnCents: 500,
        }}
      />,
    );
    expect(screen.getByText(/Al netto di 2 resi/)).toBeInTheDocument();

    rerender(
      <KpiCards
        kpis={{
          revenueCents: 100,
          count: 1,
          aovCents: 100,
          voidCount: 0,
          returnCount: 0,
          returnCents: 0,
        }}
      />,
    );
    expect(screen.queryByText(/Al netto di/)).not.toBeInTheDocument();
  });
});
