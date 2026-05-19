import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExportCsvButton } from "./export-csv-button";

describe("ExportCsvButton", () => {
  it("renders an enabled download link for the pro plan", () => {
    render(
      <ExportCsvButton
        plan="pro"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    const link = screen.getByRole("link", { name: /esporta csv/i });
    expect(link).toHaveAttribute(
      "href",
      "/api/export/receipts?from=2026-01-01&to=2026-05-19",
    );
    expect(link).toHaveAttribute("download");
  });

  it("includes the status filter in the URL when set", () => {
    render(
      <ExportCsvButton
        plan="pro"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status="VOID_ACCEPTED"
      />,
    );
    const link = screen.getByRole("link", { name: /esporta csv/i });
    expect(link).toHaveAttribute(
      "href",
      "/api/export/receipts?from=2026-01-01&to=2026-05-19&status=VOID_ACCEPTED",
    );
  });

  it("renders an upsell link to settings#billing for non-Pro plans", () => {
    render(
      <ExportCsvButton
        plan="starter"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    const link = screen.getByRole("link", { name: /esporta csv/i });
    expect(link).toHaveAttribute("href", "/dashboard/settings#billing");
    expect(link).not.toHaveAttribute("download");
  });

  it("marks the upsell link with title to hint the Pro requirement", () => {
    render(
      <ExportCsvButton
        plan="trial"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    const link = screen.getByRole("link", { name: /esporta csv/i });
    expect(link.getAttribute("title")?.toLowerCase()).toContain("pro");
  });

  it("renders the upsell link for unlimited treated as pro (same behaviour)", () => {
    render(
      <ExportCsvButton
        plan="unlimited"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    const link = screen.getByRole("link", { name: /esporta csv/i });
    expect(link).toHaveAttribute(
      "href",
      "/api/export/receipts?from=2026-01-01&to=2026-05-19",
    );
  });
});
