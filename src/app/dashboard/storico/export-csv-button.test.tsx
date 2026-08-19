import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExportCsvButton } from "./export-csv-button";

/**
 * Apre il menu del trigger Radix. In jsdom il click non basta: DropdownMenu
 * apre su `pointerdown`, che fireEvent.click non emette.
 */
function openExportMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /esporta csv/i }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
}

/** I due item del menu, nell'ordine in cui l'utente li incontra. */
function menuLinks() {
  return {
    riepilogo: screen.getByRole("menuitem", { name: /riepilogo scontrini/i }),
    dettaglio: screen.getByRole("menuitem", { name: /dettaglio articoli/i }),
  };
}

describe("ExportCsvButton", () => {
  it("offre i due formati di export al piano pro", () => {
    render(
      <ExportCsvButton
        plan="pro"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    openExportMenu();

    const { riepilogo, dettaglio } = menuLinks();
    // Il riepilogo e' la prima voce: e' il gesto abituale.
    expect(riepilogo).toHaveAttribute(
      "href",
      "/api/export/receipts?from=2026-01-01&to=2026-05-19",
    );
    expect(dettaglio).toHaveAttribute(
      "href",
      "/api/export/receipts?from=2026-01-01&to=2026-05-19&format=detail",
    );
    expect(riepilogo).toHaveAttribute("download");
    expect(dettaglio).toHaveAttribute("download");
  });

  it("apre il menu anche da tastiera", () => {
    render(
      <ExportCsvButton
        plan="pro"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    // Chi arriva col Tab non emette pointerdown: senza la gestione da
    // tastiera l'export sarebbe irraggiungibile senza mouse.
    fireEvent.keyDown(screen.getByRole("button", { name: /esporta csv/i }), {
      key: "Enter",
    });
    expect(menuLinks().riepilogo).toBeInTheDocument();
  });

  it("includes the status filter in the URL when set, su entrambi i formati", () => {
    render(
      <ExportCsvButton
        plan="pro"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status="VOID_ACCEPTED"
      />,
    );
    openExportMenu();

    const { riepilogo, dettaglio } = menuLinks();
    expect(riepilogo).toHaveAttribute(
      "href",
      "/api/export/receipts?from=2026-01-01&to=2026-05-19&status=VOID_ACCEPTED",
    );
    // I filtri della pagina valgono per entrambi i tagli: un dettaglio che
    // ignorasse lo stato non tornerebbe col riepilogo scaricato accanto.
    expect(dettaglio).toHaveAttribute(
      "href",
      "/api/export/receipts?from=2026-01-01&to=2026-05-19&status=VOID_ACCEPTED&format=detail",
    );
  });

  it("renders the download menu for unlimited treated as pro (same behaviour)", () => {
    render(
      <ExportCsvButton
        plan="unlimited"
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    openExportMenu();
    expect(menuLinks().riepilogo).toHaveAttribute(
      "href",
      "/api/export/receipts?from=2026-01-01&to=2026-05-19",
    );
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

  it("treats trial without trialStartedAt as non-Pro (upsell dialog)", () => {
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

  it("renders the download menu for an active trial (trial = Pro)", () => {
    render(
      <ExportCsvButton
        plan="trial"
        trialStartedAt={new Date()}
        dateFrom="2026-01-01"
        dateTo="2026-05-19"
        status={null}
      />,
    );
    openExportMenu();
    const { riepilogo, dettaglio } = menuLinks();
    expect(riepilogo).toHaveAttribute("download");
    expect(dettaglio).toHaveAttribute("download");
  });

  it("treats an expired trial as non-Pro (upsell dialog)", () => {
    render(
      <ExportCsvButton
        plan="trial"
        trialStartedAt={new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)}
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
