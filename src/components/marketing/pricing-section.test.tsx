import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingSection } from "./pricing-section";

function renderSection() {
  return render(<PricingSection registerHref="/register?ref=prezzi" />);
}

describe("PricingSection", () => {
  it("mostra i tre piani a pagamento", () => {
    renderSection();
    for (const plan of ["Starter", "Pro", "Team"]) {
      expect(screen.getByText(plan)).toBeVisible();
    }
  });

  it("parte dai prezzi annuali, con l'addebito unico di ciascun piano", () => {
    renderSection();
    expect(screen.getByText("29,99 €/anno (un solo addebito)")).toBeVisible();
    expect(screen.getByText("49,99 €/anno (un solo addebito)")).toBeVisible();
    expect(screen.getByText("99,99 €/anno (un solo addebito)")).toBeVisible();
    expect(screen.getByText("8,33 €")).toBeVisible();
  });

  it("col toggle mensile mostra 17,99 € per Team", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Mensile" }));
    expect(screen.getByText("17,99 €")).toBeVisible();
    expect(
      screen.getByText("o 99,99 €/anno (equivalente 8,33 €/mese)"),
    ).toBeVisible();
  });

  // Issue #1099, decisione 7: il requisito Fisconline si legge prima
  // dell'acquisto, sotto Team.
  it("dichiara sotto Team il requisito Fisconline", () => {
    renderSection();
    expect(screen.getByText("Collaboratori illimitati")).toBeVisible();
    expect(
      screen.getByText(/I collaboratori richiedono le credenziali Fisconline/),
    ).toBeVisible();
  });

  it("la CTA porta alla registrazione con la pagina di partenza", () => {
    renderSection();
    expect(
      screen.getByRole("link", { name: /Inizia i 30 giorni gratis/ }),
    ).toHaveAttribute("href", "/register?ref=prezzi");
  });
});
