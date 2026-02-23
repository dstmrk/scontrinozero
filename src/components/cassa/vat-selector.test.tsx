/**
 * VatSelector tests — aggiornati per la nuova UI a dropdown (shadcn/ui Select).
 *
 * Il componente è stato convertito da button-group a Select per supportare
 * tutti i codici IVA/natura (4%/5%/10%/22% + N1-N6).
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VatSelector } from "./vat-selector";

// jsdom non implementa scrollIntoView — richiesto da Radix UI Select
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("VatSelector", () => {
  it("renderizza il trigger mostrando la descrizione del valore corrente", () => {
    render(<VatSelector value="22" onChange={vi.fn()} />);
    expect(screen.getByText("22% – Ordinaria")).toBeInTheDocument();
  });

  it("mostra la descrizione corretta per aliquota 10%", () => {
    render(<VatSelector value="10" onChange={vi.fn()} />);
    expect(screen.getByText("10% – Ridotta")).toBeInTheDocument();
  });

  it("mostra la descrizione corretta per un codice natura", () => {
    render(<VatSelector value="N2" onChange={vi.fn()} />);
    expect(screen.getByText("N2 – Non soggette")).toBeInTheDocument();
  });

  it("aggiorna la descrizione al cambio di prop value", () => {
    const { rerender } = render(<VatSelector value="22" onChange={vi.fn()} />);

    expect(screen.getByText("22% – Ordinaria")).toBeInTheDocument();

    rerender(<VatSelector value="N4" onChange={vi.fn()} />);

    expect(screen.getByText("N4 – Esenti")).toBeInTheDocument();
  });

  it("il trigger ha role combobox (accessibilità Select)", () => {
    render(<VatSelector value="22" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("apre il dropdown e mostra tutte le 10 opzioni IVA al click", () => {
    render(<VatSelector value="22" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("combobox"));

    // Le 10 aliquote: 4%, 5%, 10%, 22%, N1-N6
    expect(
      screen.getByRole("option", { name: "4% – Ridotta" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "5% – Ridotta" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "10% – Ridotta" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "22% – Ordinaria" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "N1 – Escluse art. 15" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "N2 – Non soggette" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "N3 – Non imponibili" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "N4 – Esenti" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "N5 – Regime del margine" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "N6 – Inv. contabile" }),
    ).toBeInTheDocument();
  });

  it("chiama onChange con il codice IVA corretto quando si seleziona un'opzione", () => {
    const onChange = vi.fn();
    render(<VatSelector value="22" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "10% – Ridotta" }));

    expect(onChange).toHaveBeenCalledWith("10");
  });

  it("chiama onChange con 'N2' quando si seleziona N2", () => {
    const onChange = vi.fn();
    render(<VatSelector value="22" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "N2 – Non soggette" }));

    expect(onChange).toHaveBeenCalledWith("N2");
  });

  it("chiama onChange con '4' quando si seleziona 4%", () => {
    const onChange = vi.fn();
    render(<VatSelector value="22" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "4% – Ridotta" }));

    expect(onChange).toHaveBeenCalledWith("4");
  });
});
