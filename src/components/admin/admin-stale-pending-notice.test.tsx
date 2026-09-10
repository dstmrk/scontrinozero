import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AdminStalePendingNotice } from "./admin-stale-pending-notice";

const NOW = new Date("2026-09-10T12:00:00Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

describe("AdminStalePendingNotice", () => {
  it("non renderizza nulla quando non c'è niente in sospeso", () => {
    // La proprietà che rende utile il rilevatore: una card che mostra "0"
    // tutti i giorni si smette di leggere.
    const { container } = render(
      <AdminStalePendingNotice
        kpi={{ sale: 0, void: 0, oldestCreatedAt: null }}
        now={NOW}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("mostra il totale e la ripartizione per kind", () => {
    render(
      <AdminStalePendingNotice
        kpi={{ sale: 3, void: 1, oldestCreatedAt: hoursAgo(50) }}
        now={NOW}
      />,
    );

    expect(screen.getByText(/4 documenti in sospeso/)).toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toContain("3 vendite");
    expect(screen.getByRole("alert").textContent).toContain("1 annullo");
  });

  it("omette il kind che non ha righe", () => {
    render(
      <AdminStalePendingNotice
        kpi={{ sale: 1, void: 0, oldestCreatedAt: hoursAgo(2) }}
        now={NOW}
      />,
    );

    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("1 vendita");
    expect(text).not.toContain("annull");
  });

  it("dice l'attesa in giorni oltre le 48 ore", () => {
    render(
      <AdminStalePendingNotice
        kpi={{ sale: 1, void: 0, oldestCreatedAt: hoursAgo(24 * 21) }}
        now={NOW}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("da 21 giorni");
  });

  it("dice l'attesa in ore sotto le 48", () => {
    render(
      <AdminStalePendingNotice
        kpi={{ sale: 1, void: 0, oldestCreatedAt: hoursAgo(5) }}
        now={NOW}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("da 5 ore");
  });

  it("copre la riga appena diventata stale, sotto l'ora", () => {
    // La soglia di default è 30 minuti: una riga può essere orfana e avere
    // meno di un'ora. Senza questo ramo si leggerebbe "da 0 ore".
    render(
      <AdminStalePendingNotice
        kpi={{ sale: 1, void: 0, oldestCreatedAt: hoursAgo(0.6) }}
        now={NOW}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "da meno di un'ora",
    );
  });

  it("usa il singolare a una riga sola", () => {
    render(
      <AdminStalePendingNotice
        kpi={{ sale: 0, void: 1, oldestCreatedAt: hoursAgo(1) }}
        now={NOW}
      />,
    );

    expect(screen.getByText(/1 documento in sospeso/)).toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).toContain("da 1 ora");
  });

  it("resta leggibile senza la data della riga più vecchia", () => {
    render(
      <AdminStalePendingNotice
        kpi={{ sale: 2, void: 0, oldestCreatedAt: null }}
        now={NOW}
      />,
    );

    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("2 documenti in sospeso");
    expect(text).not.toContain("Il più vecchio");
  });
});
