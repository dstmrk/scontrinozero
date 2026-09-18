import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UtenzaPicker } from "./utenza-picker";

describe("UtenzaPicker", () => {
  it("mostra una riga per ogni partita IVA offerta dall'AdE", () => {
    render(
      <UtenzaPicker
        choices={[
          { piva: "11111111111", provenienza: "diretta" },
          { piva: "22222222222", provenienza: "incarico" },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Scegli la partita IVA su cui operare"),
    ).toBeInTheDocument();
    expect(screen.getByText("11111111111")).toBeInTheDocument();
    expect(screen.getByText("22222222222")).toBeInTheDocument();
  });

  it("mostra la ragione sociale quando c'è e il solo numero quando manca", () => {
    // Asimmetria del portale (HAR.md #18.1): le P.IVA dirette portano la
    // denominazione, gli incarichi no.
    render(
      <UtenzaPicker
        choices={[
          {
            piva: "11111111111",
            denominazione: "ALFA SRL",
            provenienza: "diretta",
          },
          { piva: "22222222222", provenienza: "incarico" },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("ALFA SRL")).toBeInTheDocument();
    expect(screen.getByText("11111111111")).toBeInTheDocument();
    expect(screen.getByText("22222222222")).toBeInTheDocument();
  });

  it("passa al chiamante la partita IVA della riga cliccata", () => {
    const onSelect = vi.fn();
    render(
      <UtenzaPicker
        choices={[
          { piva: "11111111111", provenienza: "diretta" },
          { piva: "22222222222", provenienza: "incarico" },
        ]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Collega" })[1]);

    expect(onSelect).toHaveBeenCalledWith("22222222222");
  });

  it("avverte che la scelta è definitiva prima di farla fare", () => {
    // L'AdE espone solo numeri: senza l'avviso, sbagliare azienda è facile e
    // irreversibile (l'identità si cristallizza alla prima verifica riuscita).
    render(
      <UtenzaPicker
        choices={[{ piva: "11111111111", provenienza: "diretta" }]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/non potrai più cambiarla/i)).toBeInTheDocument();
  });

  it("etichetta ogni riga con la persona da cui la partita IVA arriva", () => {
    // Il motivo per cui questa etichetta esiste: un'utenza con entrambe le
    // personae mette in elenco la partita IVA dell'esercente accanto a quella
    // di un soggetto per cui lavora. Due numeri di undici cifre, senza
    // etichetta, non si distinguono — e sbagliare qui è irreversibile.
    render(
      <UtenzaPicker
        choices={[
          { piva: "11111111111", provenienza: "diretta" },
          { piva: "22222222222", provenienza: "incarico" },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("La tua partita IVA")).toBeInTheDocument();
    expect(
      screen.getByText("Per conto di un altro soggetto"),
    ).toBeInTheDocument();
  });

  it("etichetta anche quando la provenienza è una sola", () => {
    // Nessun ramo che salta l'etichetta quando tutte le righe coincidono: chi
    // ha un solo incarico ha comunque diritto di sapere che sta collegando la
    // partita IVA di qualcun altro.
    render(
      <UtenzaPicker
        choices={[
          { piva: "11111111111", provenienza: "incarico" },
          { piva: "22222222222", provenienza: "incarico" },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Per conto di un altro soggetto")).toHaveLength(
      2,
    );
    expect(screen.queryByText("La tua partita IVA")).not.toBeInTheDocument();
  });

  describe("un solo candidato", () => {
    it("chiede di confermare, non di scegliere", () => {
      render(
        <UtenzaPicker
          choices={[{ piva: "11111111111", provenienza: "diretta" }]}
          onSelect={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Conferma la partita IVA su cui operare"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Scegli la partita IVA su cui operare"),
      ).not.toBeInTheDocument();
    });

    it("un clic solo: la riga è già la preselezione", () => {
      const onSelect = vi.fn();
      render(
        <UtenzaPicker
          choices={[{ piva: "11111111111", provenienza: "diretta" }]}
          onSelect={onSelect}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Conferma" }));

      expect(onSelect).toHaveBeenCalledWith("11111111111");
    });
  });
});
