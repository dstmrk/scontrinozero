import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminKpiCards } from "./admin-kpi-cards";
import type { AdminKpis } from "@/server/admin-metrics";

const KPIS: AdminKpis = {
  usersTotal: 1234,
  usersInRange: 12,
  usersSparkline: [{ date: "2026-08-26", value: 12 }],
  receiptsTotal: 9876,
  receiptsInRange: 120,
  receiptsSparkline: [{ date: "2026-08-26", value: 120 }],
  revenueCentsTotal: 123456789,
  revenueCentsInRange: 4567800,
  revenueSparkline: [{ date: "2026-08-26", value: 4567800 }],
  voidedInRange: 3,
  trialsActive: 7,
  trialConversionRate: 0.2537,
};

describe("AdminKpiCards", () => {
  it("mostra il totale storico accanto al valore del periodo", () => {
    render(<AdminKpiCards kpis={KPIS} />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/1\.?234 in totale/)).toBeInTheDocument();
  });

  it("formatta l'incasso in euro partendo dai centesimi", () => {
    render(<AdminKpiCards kpis={KPIS} />);

    expect(screen.getByText(/45\.?678,00/)).toBeInTheDocument();
  });

  it("arrotonda la conversione trial a una cifra decimale percentuale", () => {
    render(<AdminKpiCards kpis={KPIS} />);

    expect(screen.getByText("25,4%")).toBeInTheDocument();
  });

  it("mostra 0% quando nessun trial è ancora partito", () => {
    render(<AdminKpiCards kpis={{ ...KPIS, trialConversionRate: 0 }} />);

    expect(screen.getByText("0,0%")).toBeInTheDocument();
  });

  it("mostra i trial attivi e gli annullati del periodo", () => {
    render(<AdminKpiCards kpis={KPIS} />);

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("etichetta ogni sparkline con la metrica che rappresenta", () => {
    render(<AdminKpiCards kpis={KPIS} />);

    expect(
      screen.getByLabelText(/andamento nuovi utenti/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/andamento scontrini/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/andamento incasso/i)).toBeInTheDocument();
  });
});
