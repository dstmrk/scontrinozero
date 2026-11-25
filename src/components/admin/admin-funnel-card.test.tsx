import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminFunnelCard } from "./admin-funnel-card";
import type { AdminFunnel } from "@/server/admin-metrics";

const FUNNEL: AdminFunnel = {
  registered: 85,
  onboarded: { total: 53, methods: { fisconline: 39, cie: 14, spid: 0 } },
  issuedReceipts: { total: 31, methods: { fisconline: 25, cie: 6, spid: 0 } },
  paying: { total: 12, methods: { fisconline: 10, cie: 2, spid: 0 } },
  payingWithoutReceipts: 2,
};

/** La barra colorata di un gradino: il contenitore dei segmenti per metodo. */
function barOf(label: string): HTMLElement {
  const row = screen.getByText(label).parentElement!;
  return row.querySelector<HTMLElement>("[style]")!;
}

describe("AdminFunnelCard", () => {
  it("mostra i quattro gradini con i loro totali", () => {
    render(<AdminFunnelCard funnel={FUNNEL} />);

    for (const [label, total] of [
      ["Registrati", "85"],
      ["Onboarding", "53"],
      ["Con scontrini", "31"],
      ["Paganti", "12"],
    ]) {
      expect(screen.getByText(label).parentElement).toHaveTextContent(total);
    }
  });

  it("calcola ogni percentuale sul gradino precedente, non sui registrati", () => {
    render(<AdminFunnelCard funnel={FUNNEL} />);

    // 53/85 = 62%, 31/53 = 58%, 12/31 = 39%.
    expect(screen.getByText("Onboarding").parentElement).toHaveTextContent(
      "62%",
    );
    expect(screen.getByText("Con scontrini").parentElement).toHaveTextContent(
      "58%",
    );
    expect(screen.getByText("Paganti").parentElement).toHaveTextContent("39%");
  });

  it("misura ogni barra sui registrati, così le lunghezze si confrontano", () => {
    render(<AdminFunnelCard funnel={FUNNEL} />);

    expect(barOf("Registrati").style.width).toBe("100%");
    expect(Number.parseFloat(barOf("Onboarding").style.width)).toBeCloseTo(
      (53 / 85) * 100,
    );
  });

  it("divide la barra per metodo di accesso, in quota sul gradino", () => {
    render(<AdminFunnelCard funnel={FUNNEL} />);

    const bar = barOf("Onboarding");
    const fisconline = bar.querySelector<HTMLElement>(
      '[data-method="fisconline"]',
    )!;
    expect(Number.parseFloat(fisconline.style.width)).toBeCloseTo(
      (39 / 53) * 100,
    );
    expect(screen.getByText("Onboarding").parentElement).toHaveTextContent(
      "39 F / 14 C",
    );
  });

  it("omette i metodi a zero dalla barra e dalla legenda", () => {
    render(<AdminFunnelCard funnel={FUNNEL} />);

    expect(document.querySelector('[data-method="spid"]')).toBeNull();
    expect(screen.queryByText("SPID")).not.toBeInTheDocument();
    expect(screen.getByText("Fisconline")).toBeInTheDocument();
    expect(screen.getByText("CIE")).toBeInTheDocument();
  });

  it("mostra la SPID quando qualcuno la usa", () => {
    render(
      <AdminFunnelCard
        funnel={{
          ...FUNNEL,
          onboarded: {
            total: 53,
            methods: { fisconline: 38, cie: 14, spid: 1 },
          },
        }}
      />,
    );

    expect(screen.getByText("SPID")).toBeInTheDocument();
    expect(screen.getByText("Onboarding").parentElement).toHaveTextContent(
      "38 F / 14 C / 1 S",
    );
  });

  it("segnala i paganti che il funnel lascia fuori", () => {
    render(<AdminFunnelCard funnel={FUNNEL} />);

    expect(
      screen.getByText("Fuori dal funnel: 2 paganti senza scontrini."),
    ).toBeInTheDocument();
  });

  it("usa il singolare per un solo pagante fuori dal funnel", () => {
    render(
      <AdminFunnelCard funnel={{ ...FUNNEL, payingWithoutReceipts: 1 }} />,
    );

    expect(
      screen.getByText("Fuori dal funnel: 1 pagante senza scontrini."),
    ).toBeInTheDocument();
  });

  it("non mostra la nota quando tutti i paganti stanno nel funnel", () => {
    render(
      <AdminFunnelCard funnel={{ ...FUNNEL, payingWithoutReceipts: 0 }} />,
    );

    expect(screen.queryByText(/Fuori dal funnel/)).not.toBeInTheDocument();
  });

  it("su un database vuoto mostra zeri, non NaN né barre infinite", () => {
    const empty = { total: 0, methods: { fisconline: 0, cie: 0, spid: 0 } };
    render(
      <AdminFunnelCard
        funnel={{
          registered: 0,
          onboarded: empty,
          issuedReceipts: empty,
          paying: empty,
          payingWithoutReceipts: 0,
        }}
      />,
    );

    expect(document.body).not.toHaveTextContent("NaN");
    expect(barOf("Onboarding").style.width).toBe("0%");
    expect(screen.getByText("Paganti").parentElement).toHaveTextContent("0%");
  });
});
