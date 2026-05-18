import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProFeatureGate } from "./pro-feature-gate";

describe("ProFeatureGate", () => {
  it("renders children when plan is pro", () => {
    render(
      <ProFeatureGate plan="pro">
        <div>protected content</div>
      </ProFeatureGate>,
    );
    expect(screen.getByText("protected content")).toBeInTheDocument();
  });

  it("renders children when plan is unlimited", () => {
    render(
      <ProFeatureGate plan="unlimited">
        <div>protected content</div>
      </ProFeatureGate>,
    );
    expect(screen.getByText("protected content")).toBeInTheDocument();
  });

  it("renders upsell card when plan is starter", () => {
    render(
      <ProFeatureGate plan="starter">
        <div>protected content</div>
      </ProFeatureGate>,
    );
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(screen.getByText("Disponibile sul piano Pro")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /passa a pro/i });
    expect(link).toHaveAttribute("href", "/dashboard/settings#billing");
  });

  it("renders upsell card when plan is trial", () => {
    render(
      <ProFeatureGate plan="trial">
        <div>protected content</div>
      </ProFeatureGate>,
    );
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /passa a pro/i }),
    ).toBeInTheDocument();
  });

  it("renders upsell card for developer plans (Pro feature gate is plan-Pro only)", () => {
    render(
      <ProFeatureGate plan="developer_indie">
        <div>protected content</div>
      </ProFeatureGate>,
    );
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /passa a pro/i }),
    ).toBeInTheDocument();
  });

  it("uses the custom title when provided", () => {
    render(
      <ProFeatureGate plan="starter" title="Analytics avanzata">
        <div>protected content</div>
      </ProFeatureGate>,
    );
    expect(screen.getByText("Analytics avanzata")).toBeInTheDocument();
  });

  it("uses the custom description when provided", () => {
    render(
      <ProFeatureGate
        plan="starter"
        description="Sblocca i grafici per i tuoi scontrini."
      >
        <div>protected content</div>
      </ProFeatureGate>,
    );
    expect(
      screen.getByText("Sblocca i grafici per i tuoi scontrini."),
    ).toBeInTheDocument();
  });
});
