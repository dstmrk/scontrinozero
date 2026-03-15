import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanSelection } from "./plan-selection";

// --- Mocks ---

vi.mock("./checkout-button", () => ({
  CheckoutButton: ({
    priceId,
    label,
    variant,
  }: {
    priceId: string;
    label: string;
    variant?: string;
  }) => (
    <button data-testid={`checkout-${priceId}`} data-variant={variant}>
      {label}
    </button>
  ),
}));

// --- Helpers ---

const defaultProps = {
  starterMonthly: "price_starter_monthly",
  starterYearly: "price_starter_yearly",
  proMonthly: "price_pro_monthly",
  proYearly: "price_pro_yearly",
};

function renderComponent() {
  return render(<PlanSelection {...defaultProps} />);
}

// --- Tests ---

describe("PlanSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra il toggle Mensile/Annuale", () => {
    renderComponent();
    expect(screen.getByText("Mensile")).toBeInTheDocument();
    expect(screen.getByText("Annuale")).toBeInTheDocument();
  });

  it("parte in modalità mensile di default", () => {
    renderComponent();
    expect(
      screen.getByTestId("checkout-price_starter_monthly"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("checkout-price_pro_monthly"),
    ).toBeInTheDocument();
  });

  it("mostra i prezzi mensili nel default", () => {
    renderComponent();
    expect(screen.getByText("€4.99/mese")).toBeInTheDocument();
    expect(screen.getByText("€8.99/mese")).toBeInTheDocument();
  });

  it("non mostra il badge -50% in modalità mensile", () => {
    renderComponent();
    expect(screen.queryByText("-50%")).not.toBeInTheDocument();
  });

  it("passa al piano annuale al click su 'Annuale'", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Annuale"));
    expect(
      screen.getByTestId("checkout-price_starter_yearly"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("checkout-price_pro_yearly")).toBeInTheDocument();
  });

  it("mostra i prezzi annuali dopo il toggle", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Annuale"));
    expect(screen.getByText("€29.99/anno")).toBeInTheDocument();
    expect(screen.getByText("€49.99/anno")).toBeInTheDocument();
  });

  it("mostra il badge -50% in modalità annuale", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Annuale"));
    expect(screen.getByText("-50%")).toBeInTheDocument();
  });

  it("torna al piano mensile al secondo click su 'Mensile'", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Annuale"));
    fireEvent.click(screen.getByText("Mensile"));
    expect(
      screen.getByTestId("checkout-price_starter_monthly"),
    ).toBeInTheDocument();
  });

  it("usa variant outline per il bottone Starter", () => {
    renderComponent();
    const starterBtn = screen.getByTestId("checkout-price_starter_monthly");
    expect(starterBtn).toHaveAttribute("data-variant", "outline");
  });

  it("usa variant default per il bottone Pro", () => {
    renderComponent();
    const proBtn = screen.getByTestId("checkout-price_pro_monthly");
    expect(proBtn).not.toHaveAttribute("data-variant", "outline");
  });

  it("mostra le card Starter e Pro", () => {
    renderComponent();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it("non mostra i price ID annuali in modalità mensile", () => {
    renderComponent();
    expect(
      screen.queryByTestId("checkout-price_starter_yearly"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("checkout-price_pro_yearly"),
    ).not.toBeInTheDocument();
  });
});
