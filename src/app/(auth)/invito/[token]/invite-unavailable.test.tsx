import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InviteUnavailable } from "./invite-unavailable";

describe("InviteUnavailable", () => {
  it("inesistente: dice perché e rimanda al login", () => {
    render(<InviteUnavailable view={{ kind: "missing" }} />);

    expect(screen.getByText("Invito non valido")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "accedi" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("scaduto: chiede un invito nuovo al titolare dell'attività", () => {
    render(
      <InviteUnavailable
        view={{ kind: "expired", businessName: "Bar Centrale" }}
      />,
    );

    expect(screen.getByText("Invito scaduto")).toBeInTheDocument();
    expect(screen.getByText(/Bar Centrale/)).toBeInTheDocument();
  });

  it("scaduto senza nome dell'attività resta leggibile", () => {
    render(
      <InviteUnavailable view={{ kind: "expired", businessName: null }} />,
    );

    expect(screen.getByText(/questa attività/)).toBeInTheDocument();
  });

  it("errore di lettura: invita a riprovare", () => {
    render(<InviteUnavailable view={{ kind: "error" }} />);

    expect(
      screen.getByText(
        "Non riusciamo a leggere l'invito. Riprova tra qualche minuto.",
      ),
    ).toBeInTheDocument();
  });
});
