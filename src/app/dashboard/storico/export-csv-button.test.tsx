import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders the download link for unlimited treated as pro (same behaviour)", () => {
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
    expect(link).toHaveAttribute("download");
  });

  it("renders a Pro-marked trigger button (not a link) for non-Pro plans", () => {
    render(
      <ExportCsvButton
        plan="starter"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    // It's a button trigger, not a direct download/upsell link.
    const trigger = screen.getByRole("button", { name: /esporta csv/i });
    expect(trigger).toBeInTheDocument();
    // The "Pro" badge is visible before any interaction.
    expect(trigger).toHaveTextContent(/pro/i);
    // No upsell link is rendered yet — it lives inside the closed dialog.
    expect(
      screen.queryByRole("link", { name: /passa a pro/i }),
    ).not.toBeInTheDocument();
  });

  it("opens an explanatory dialog linking to settings#billing on click (starter)", () => {
    render(
      <ExportCsvButton
        plan="starter"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /esporta csv/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const upsell = screen.getByRole("link", { name: /passa a pro/i });
    expect(upsell).toHaveAttribute("href", "/dashboard/settings#billing");
    expect(upsell).not.toHaveAttribute("download");
  });

  it("treats trial like a non-Pro plan (same upsell dialog)", () => {
    render(
      <ExportCsvButton
        plan="trial"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /esporta csv/i }));

    const upsell = screen.getByRole("link", { name: /passa a pro/i });
    expect(upsell).toHaveAttribute("href", "/dashboard/settings#billing");
  });
});
