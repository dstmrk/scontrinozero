import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminDocumentKpiCards, AdminUserKpiCards } from "./admin-kpi-cards";
import type { AdminDocumentKpis, AdminUserKpis } from "@/server/admin-metrics";

const USER_KPIS: AdminUserKpis = {
  usersTotal: 1234,
  usersInRange: 12,
  usersSparkline: [{ date: "2026-08-26", value: 12 }],
  trialsActive: 7,
  trialConversionRate: 0.2537,
};

const DOCUMENT_KPIS: AdminDocumentKpis = {
  receiptsTotal: 9876,
  receiptsInRange: 120,
  receiptsSparkline: [{ date: "2026-08-26", value: 120 }],
  revenueCentsTotal: 123456789,
  revenueCentsInRange: 4567800,
  revenueSparkline: [{ date: "2026-08-26", value: 4567800 }],
  voidedInRange: 3,
};

describe("AdminUserKpiCards", () => {
  it("mostra il totale storico accanto al valore del periodo", () => {
    render(<AdminUserKpiCards kpis={USER_KPIS} />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/1\.?234 in totale/)).toBeInTheDocument();
  });

  it("arrotonda la conversione trial a una cifra decimale percentuale", () => {
    render(<AdminUserKpiCards kpis={USER_KPIS} />);

    expect(screen.getByText("25,4%")).toBeInTheDocument();
  });

  it("mostra 0% quando nessun trial è ancora partito", () => {
    render(
      <AdminUserKpiCards kpis={{ ...USER_KPIS, trialConversionRate: 0 }} />,
    );

    expect(screen.getByText("0,0%")).toBeInTheDocument();
  });

  it("mostra i trial attivi", () => {
    render(<AdminUserKpiCards kpis={USER_KPIS} />);

    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("etichetta la sparkline con la metrica che rappresenta", () => {
    render(<AdminUserKpiCards kpis={USER_KPIS} />);

    expect(
      screen.getByLabelText(/andamento nuovi utenti/i),
    ).toBeInTheDocument();
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

  it("mostra gli annullati del periodo", () => {
    render(<AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("etichetta ogni sparkline con la metrica che rappresenta", () => {
    render(<AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />);

    expect(screen.getByLabelText(/andamento scontrini/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/andamento incasso/i)).toBeInTheDocument();
  });

  it("non rende nessuna card degli utenti", () => {
    render(<AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />);

    expect(screen.queryByText("Nuovi utenti")).not.toBeInTheDocument();
    expect(screen.queryByText("Trial attivi")).not.toBeInTheDocument();
  });
});

describe("le due metà insieme", () => {
  it("compongono le sei card del pannello senza sovrapporsi", () => {
    render(
      <>
        <AdminUserKpiCards kpis={USER_KPIS} />
        <AdminDocumentKpiCards kpis={DOCUMENT_KPIS} />
      </>,
    );

    for (const title of [
      "Nuovi utenti",
      "Trial attivi",
      "Conversione trial",
      "Scontrini",
      "Incasso",
      "Annullati",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
