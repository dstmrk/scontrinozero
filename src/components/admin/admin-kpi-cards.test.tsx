import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminDocumentKpiCards, AdminUserKpiCards } from "./admin-kpi-cards";
import type { AdminDocumentKpis, AdminUserKpis } from "@/server/admin-metrics";

const USER_KPIS: AdminUserKpis = {
  usersTotal: 1234,
  usersInRange: 12,
  usersSparkline: [
    { date: "2026-08-25", value: 5 },
    { date: "2026-08-26", value: 7 },
  ],
  trialsOnboarded: 9,
};

const DOCUMENT_KPIS: AdminDocumentKpis = {
  receiptsTotal: 9876,
  receiptsInRange: 120,
  receiptsSparkline: [{ date: "2026-08-26", value: 120 }],
  revenueCentsTotal: 123456789,
  revenueCentsInRange: 4567800,
  revenueSparkline: [{ date: "2026-08-26", value: 4567800 }],
  fisconlineUsers: 40,
  cieUsers: 12,
};

describe("AdminUserKpiCards", () => {
  it("mostra il totale storico accanto al valore del periodo", () => {
    render(<AdminUserKpiCards kpis={USER_KPIS} />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/1\.?234 in totale/)).toBeInTheDocument();
  });

  it("mostra i trial attivi che hanno completato l'onboarding", () => {
    render(<AdminUserKpiCards kpis={USER_KPIS} />);

    expect(
      screen.getByText("Trial: onboarding completato"),
    ).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("etichetta la sparkline come cumulata", () => {
    render(<AdminUserKpiCards kpis={USER_KPIS} />);

    expect(
      screen.getByLabelText(/andamento cumulato nuovi utenti/i),
    ).toBeInTheDocument();
  });

  it("cumula i punti della sparkline invece di mostrare il valore giornaliero", () => {
    // Il secondo giorno (7 nuovi utenti) deve leggersi come 5 + 7 = 12, non 7.
    render(<AdminUserKpiCards kpis={USER_KPIS} />);

    const svg = screen.getByLabelText(/andamento cumulato nuovi utenti/i);
    const polyline = svg.querySelector("polyline");
    const points = polyline?.getAttribute("points")?.split(" ") ?? [];
    const lastY = Number(points.at(-1)?.split(",")[1]);
    const firstY = Number(points.at(0)?.split(",")[1]);
    // Coordinate y più piccole = valori più alti (asse SVG capovolto): il
    // punto cumulato finale (12) deve stare più in alto del primo (5).
    expect(lastY).toBeLessThan(firstY);
  });

  it("non rende nessuna card degli scontrini", () => {
    // Le due metà si montano in boundary Suspense distinti: se questa tornasse
    // a portarsi dietro una card dei documenti, comparirebbe due volte in
    // pagina — o, peggio, aspetterebbe la query lenta.
    render(<AdminUserKpiCards kpis={USER_KPIS} />);

    expect(screen.queryByText("Scontrini")).not.toBeInTheDocument();
    expect(screen.queryByText("Incasso")).not.toBeInTheDocument();
  });
});

describe("AdminDocumentKpiCards", () => {
  it("mostra il totale storico accanto al valore del periodo", () => {
    render(<AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />);

    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText(/9\.?876 in totale/)).toBeInTheDocument();
  });

  it("formatta l'incasso in euro partendo dai centesimi", () => {
    render(<AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />);

    expect(screen.getByText(/45\.?678,00/)).toBeInTheDocument();
  });

  it("mostra fisconline e CIE fianco a fianco", () => {
    render(<AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />);

    expect(screen.getByText("Fisconline vs CIE")).toBeInTheDocument();
    expect(screen.getByText("40 / 12")).toBeInTheDocument();
  });

  it("etichetta ogni sparkline con la metrica che rappresenta", () => {
    render(<AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />);

    expect(screen.getByLabelText(/andamento scontrini/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/andamento incasso/i)).toBeInTheDocument();
  });

  it("non rende nessuna card degli utenti", () => {
    render(<AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />);

    expect(screen.queryByText("Nuovi utenti")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Trial: onboarding completato"),
    ).not.toBeInTheDocument();
  });
});

describe("le due metà insieme", () => {
  it("compongono le cinque card del pannello senza sovrapporsi", () => {
    render(
      <>
        <AdminUserKpiCards kpis={USER_KPIS} />
        <AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />
      </>,
    );

    for (const title of [
      "Nuovi utenti",
      "Trial: onboarding completato",
      "Scontrini",
      "Incasso",
      "Fisconline vs CIE",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
