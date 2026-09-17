import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminTrialFunnelCard } from "./admin-trial-funnel-card";
import type { AdminTrialFunnel } from "@/server/admin-metrics";

const FUNNEL: AdminTrialFunnel = {
  registered: 10,
  onboarded: 6,
  issuedReceipts: 4,
};

describe("AdminTrialFunnelCard", () => {
  it("mostra le tre fasi del funnel", () => {
    render(<AdminTrialFunnelCard funnel={FUNNEL} />);

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Registrati")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Scontrini")).toBeInTheDocument();
  });

  it("formatta i numeri con il separatore delle migliaia italiano", () => {
    render(
      <AdminTrialFunnelCard
        funnel={{ registered: 1234, onboarded: 900, issuedReceipts: 10 }}
      />,
    );

    expect(screen.getByText(/1\.?234/)).toBeInTheDocument();
  });

  it("mostra il titolo della card", () => {
    render(<AdminTrialFunnelCard funnel={FUNNEL} />);

    expect(screen.getByText("Funnel trial (periodo)")).toBeInTheDocument();
  });
});
