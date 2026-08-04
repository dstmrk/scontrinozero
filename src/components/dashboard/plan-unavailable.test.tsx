// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { PlanUnavailable } from "./plan-unavailable";

describe("PlanUnavailable", () => {
  it("rende il messaggio preciso passato da getPlanSafe", () => {
    render(
      <PlanUnavailable message="Profilo non disponibile. Contatta il supporto." />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("Profilo non disponibile. Contatta il supporto."),
    ).toBeInTheDocument();
  });

  it("distingue il sovraccarico dal profilo mancante", () => {
    // È il motivo per cui il messaggio arriva dal chiamante e non è hardcoded:
    // il boundary di segmento non può distinguere i due casi (in produzione
    // Next gli cancella il messaggio), la pagina sì.
    render(
      <PlanUnavailable message="Servizio temporaneamente sovraccarico, riprova tra qualche istante." />,
    );

    expect(
      screen.getByText(
        "Servizio temporaneamente sovraccarico, riprova tra qualche istante.",
      ),
    ).toBeInTheDocument();
  });
});
