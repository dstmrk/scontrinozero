import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminKpiCardsSkeleton, AdminTableSkeleton } from "./admin-skeletons";

/** Quanti segnaposto grigi contiene la card in posizione `index`. */
function skeletonsInCard(container: HTMLElement, index: number): number {
  const card = container.querySelectorAll('[data-slot="card"]')[index];
  return card.querySelectorAll('[data-slot="skeleton"]').length;
}

describe("AdminKpiCardsSkeleton", () => {
  it("rende esattamente le card che il boundary dovrà rimpiazzare", () => {
    // Se il numero non coincide con quello del gruppo vero, la griglia si
    // riassesta quando i dati arrivano — cioè proprio il salto di layout che
    // lo skeleton esiste per evitare.
    const { container } = render(
      <AdminKpiCardsSkeleton count={3} label="metriche utenti" />,
    );

    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(3);
  });

  it("dà la sparkline solo alle prime N card, non a tutte", () => {
    // Il gruppo utenti ha una sola card con sparkline su tre: disegnarla su
    // tutte renderebbe lo scheletro più alto del contenuto che sostituisce.
    const { container } = render(
      <AdminKpiCardsSkeleton count={3} sparklines={1} label="utenti" />,
    );

    expect(skeletonsInCard(container, 0)).toBe(4);
    expect(skeletonsInCard(container, 1)).toBe(3);
    expect(skeletonsInCard(container, 2)).toBe(3);
  });

  it("non disegna nessuna sparkline quando il gruppo non ne ha", () => {
    const { container } = render(
      <AdminKpiCardsSkeleton count={2} label="utenti" />,
    );

    expect(skeletonsInCard(container, 0)).toBe(3);
    expect(skeletonsInCard(container, 1)).toBe(3);
  });

  it("tiene le card finte fuori dall'albero di accessibilità", () => {
    const { container } = render(
      <AdminKpiCardsSkeleton count={2} label="metriche utenti" />,
    );

    for (const card of container.querySelectorAll('[data-slot="card"]')) {
      expect(card).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("annuncia cosa sta caricando a chi usa uno screen reader", () => {
    render(<AdminKpiCardsSkeleton count={3} label="metriche scontrini" />);

    expect(
      screen.getByText(/caricamento di metriche scontrini in corso/i),
    ).toBeInTheDocument();
  });
});

describe("AdminTableSkeleton", () => {
  it("mostra titolo e descrizione veri, non barrette grigie", () => {
    render(
      <AdminTableSkeleton
        title="Utenti paganti"
        description="Starter e Pro."
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Utenti paganti" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Starter e Pro.")).toBeInTheDocument();
  });

  it("omette la descrizione quando non c'è", () => {
    render(<AdminTableSkeleton title="Solo titolo" />);

    expect(
      screen.getByRole("heading", { name: "Solo titolo" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/caricamento di solo titolo/i)).toBeInTheDocument();
  });

  it("disegna il numero di righe richiesto", () => {
    const { container } = render(<AdminTableSkeleton title="Trial" rows={3} />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      3,
    );
  });
});
