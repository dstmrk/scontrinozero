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

let mockNative = false;
vi.mock("@/lib/native/native-shell", () => ({
  useIsNativeShell: () => mockNative,
}));

// --- Helpers ---

const defaultProps = {
  starterMonthly: "price_starter_monthly",
  starterYearly: "price_starter_yearly",
  proMonthly: "price_pro_monthly",
  proYearly: "price_pro_yearly",
  teamMonthly: "price_team_monthly",
  teamYearly: "price_team_yearly",
  adeLoginMethod: "fisconline" as const,
};

function renderComponent(
  overrides: Partial<Parameters<typeof PlanSelection>[0]> = {},
) {
  return render(<PlanSelection {...defaultProps} {...overrides} />);
}

// --- Tests ---

describe("PlanSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNative = false;
  });

  it.each([
    {
      name: "mostra il toggle Mensile/Annuale",
      first: "Mensile",
      second: "Annuale",
    },
    {
      name: "mostra i prezzi annuali nel default",
      first: "29,99 €/anno",
      second: "49,99 €/anno",
    },
    { name: "mostra le card Starter e Pro", first: "Starter", second: "Pro" },
  ])("$name", ({ first, second }) => {
    renderComponent();
    expect(screen.getByText(first)).toBeInTheDocument();
    expect(screen.getByText(second)).toBeInTheDocument();
  });

  it("parte in modalità annuale di default", () => {
    renderComponent();
    expect(
      screen.getByTestId("checkout-price_starter_yearly"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("checkout-price_pro_yearly")).toBeInTheDocument();
  });

  it("mostra il badge -50% di default (annuale)", () => {
    renderComponent();
    expect(screen.getByText("-50%")).toBeInTheDocument();
  });

  it("passa al piano mensile al click su 'Mensile'", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Mensile"));
    expect(
      screen.getByTestId("checkout-price_starter_monthly"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("checkout-price_pro_monthly"),
    ).toBeInTheDocument();
  });

  it("mostra i prezzi mensili dopo il toggle", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Mensile"));
    expect(screen.getByText("4,99 €/mese")).toBeInTheDocument();
    expect(screen.getByText("8,99 €/mese")).toBeInTheDocument();
  });

  it("non mostra il badge -50% in modalità mensile", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Mensile"));
    expect(screen.queryByText("-50%")).not.toBeInTheDocument();
  });

  it("torna al piano annuale al secondo click su 'Annuale'", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Mensile"));
    fireEvent.click(screen.getByText("Annuale"));
    expect(
      screen.getByTestId("checkout-price_starter_yearly"),
    ).toBeInTheDocument();
  });

  it("usa variant outline per il bottone Starter", () => {
    renderComponent();
    const starterBtn = screen.getByTestId("checkout-price_starter_yearly");
    expect(starterBtn).toHaveAttribute("data-variant", "outline");
  });

  it("usa variant default per il bottone Pro", () => {
    renderComponent();
    const proBtn = screen.getByTestId("checkout-price_pro_yearly");
    expect(proBtn).not.toHaveAttribute("data-variant", "outline");
  });

  it("non mostra i price ID mensili in modalità annuale", () => {
    renderComponent();
    expect(
      screen.queryByTestId("checkout-price_starter_monthly"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("checkout-price_pro_monthly"),
    ).not.toBeInTheDocument();
  });
});

// Issue #1099, decisione 7: il requisito Fisconline si dichiara prima
// dell'acquisto, e chi oggi entra con CIE o SPID lo legge accanto al
// pulsante.
describe("PlanSelection — piano Team", () => {
  beforeEach(() => {
    mockNative = false;
  });

  it("mostra la card Team con il prezzo annuale e il checkout annuale", () => {
    renderComponent();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("99,99 €/anno")).toBeInTheDocument();
    expect(
      screen.getByTestId("checkout-price_team_yearly"),
    ).toBeInTheDocument();
  });

  it("dopo il toggle mostra il prezzo e il checkout mensili", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Mensile"));
    expect(screen.getByText("17,99 €/mese")).toBeInTheDocument();
    expect(
      screen.getByTestId("checkout-price_team_monthly"),
    ).toBeInTheDocument();
  });

  it("dichiara che i collaboratori richiedono Fisconline", () => {
    renderComponent();
    expect(
      screen.getByText(/collaboratori richiedono le credenziali Fisconline/),
    ).toBeInTheDocument();
  });

  it("con Fisconline non mostra l'avviso sul cambio di accesso", () => {
    renderComponent();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it.each([
    ["cie", "CIE"],
    ["spid", "SPID"],
  ] as const)(
    "con %s avvisa prima del checkout e porta alla guida Fisconline",
    (adeLoginMethod, label) => {
      renderComponent({ adeLoginMethod });
      const note = screen.getByRole("note");
      expect(note).toHaveTextContent(`Oggi accedi all'AdE con ${label}`);
      expect(note).toHaveTextContent("15 giorni");
      expect(
        screen.getByRole("link", { name: /Come ottenere le credenziali/ }),
      ).toHaveAttribute("href", "/help/credenziali-fisconline");
    },
  );
});

describe("PlanSelection — guscio nativo (issue #1044)", () => {
  it("non rende né prezzi né checkout", () => {
    mockNative = true;
    const { container } = renderComponent();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });
});
