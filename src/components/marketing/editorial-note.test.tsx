import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorialNote } from "./editorial-note";
import { CONTACT_EMAIL } from "@/lib/contact";

describe("EditorialNote", () => {
  it("dichiara che le norme sono citate con estremo e data", () => {
    render(<EditorialNote />);
    expect(screen.getByText(/estremo e data/i)).toBeInTheDocument();
  });

  it("mantiene il disclaimer di non sostituzione del commercialista", () => {
    render(<EditorialNote />);
    expect(screen.getByText(/non sostituisce/i)).toBeInTheDocument();
    expect(screen.getByText(/commercialista/i)).toBeInTheDocument();
  });

  it("offre un canale per segnalare imprecisioni", () => {
    render(<EditorialNote />);
    const link = screen.getByRole("link", { name: CONTACT_EMAIL });
    expect(link).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });

  /**
   * Guard anti-overpromising. Un blocco di trasparenza che rivendica processi
   * inesistenti — revisione di un professionista, cadenze di aggiornamento,
   * certificazioni — è peggio di nessun blocco: è una promessa falsa su
   * contenuto fiscale. Qui si dichiara solo ciò che è verificabile dal testo
   * stesso (le norme citate con estremo e data) e ciò che è realmente offerto
   * (un indirizzo a cui scrivere).
   */
  it("non rivendica processi editoriali che non esistono", () => {
    const { container } = render(<EditorialNote />);
    const testo = container.textContent ?? "";
    for (const claim of [
      /verificat[oa] da un (commercialista|professionista|esperto)/i,
      /revisionat[oa] da/i,
      /aggiornat[oa] (ogni|mensilmente|settimanalmente|trimestralmente)/i,
      /certificat/i,
      /garantiamo/i,
      /rispondiamo entro/i,
    ]) {
      expect(testo, `claim non sostenibile: ${claim.source}`).not.toMatch(
        claim,
      );
    }
  });
});
