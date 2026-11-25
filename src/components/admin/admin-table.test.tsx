import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminTable } from "./admin-table";

type Row = { name: string; qty: number };

const COLUMNS = [
  { header: "Nome", cell: (r: Row) => r.name },
  {
    header: "Quantità",
    cell: (r: Row) => String(r.qty),
    align: "right" as const,
  },
];

describe("AdminTable", () => {
  it("rende un'intestazione per colonna e una riga per elemento", () => {
    render(
      <AdminTable
        title="Elenco"
        columns={COLUMNS}
        rows={[
          { name: "Anna", qty: 2 },
          { name: "Bruno", qty: 5 },
        ]}
        rowKey={(r) => r.name}
        empty="Nessun dato"
      />,
    );

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
    expect(screen.getByText("Bruno")).toBeInTheDocument();
  });

  it("mostra il messaggio di vuoto al posto della tabella quando non c'è nulla", () => {
    render(
      <AdminTable
        title="Elenco"
        columns={COLUMNS}
        rows={[]}
        rowKey={(r) => r.name}
        empty="Nessun dato nel periodo"
      />,
    );

    expect(screen.getByText("Nessun dato nel periodo")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("usa il titolo come nome accessibile della tabella", () => {
    render(
      <AdminTable
        title="Top esercenti"
        columns={COLUMNS}
        rows={[{ name: "Anna", qty: 1 }]}
        rowKey={(r) => r.name}
        empty="—"
      />,
    );

    expect(
      screen.getByRole("table", { name: "Top esercenti" }),
    ).toBeInTheDocument();
  });

  it("mostra la descrizione quando è passata", () => {
    render(
      <AdminTable
        title="Elenco"
        description="Ultimi 30 giorni"
        columns={COLUMNS}
        rows={[{ name: "Anna", qty: 1 }]}
        rowKey={(r) => r.name}
        empty="—"
      />,
    );

    expect(screen.getByText("Ultimi 30 giorni")).toBeInTheDocument();
  });

  it("allinea a destra solo le colonne che lo chiedono", () => {
    render(
      <AdminTable
        title="Elenco"
        columns={COLUMNS}
        rows={[{ name: "Anna", qty: 1 }]}
        rowKey={(r) => r.name}
        empty="—"
      />,
    );

    const headers = screen.getAllByRole("columnheader");
    expect(headers[0].className).not.toContain("text-right");
    expect(headers[1].className).toContain("text-right");
  });

  it("rende il gruppo in coda sotto un'etichetta, con le sue righe", () => {
    render(
      <AdminTable
        title="Elenco"
        columns={COLUMNS}
        rows={[{ name: "Anna", qty: 1 }]}
        appendix={{
          label: "Prima del periodo",
          rows: [{ name: "Bruno", qty: 2 }],
        }}
        rowKey={(r) => r.name}
        empty="—"
      />,
    );

    const label = screen.getByRole("rowheader", { name: "Prima del periodo" });
    expect(label).toHaveAttribute("colspan", String(COLUMNS.length));
    expect(screen.getByText("Bruno").closest("tr")).toHaveClass("bg-muted/50");
    expect(screen.getByText("Anna").closest("tr")).not.toHaveClass(
      "bg-muted/50",
    );
  });

  it("con il solo gruppo in coda mostra la tabella, non lo stato vuoto", () => {
    render(
      <AdminTable
        title="Elenco"
        columns={COLUMNS}
        rows={[]}
        appendix={{
          label: "Prima del periodo",
          rows: [{ name: "Bruno", qty: 2 }],
        }}
        rowKey={(r) => r.name}
        empty="Vuoto"
      />,
    );

    expect(screen.queryByText("Vuoto")).not.toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
  });

  it("un gruppo in coda vuoto non lascia un'etichetta orfana", () => {
    render(
      <AdminTable
        title="Elenco"
        columns={COLUMNS}
        rows={[]}
        appendix={{ label: "Prima del periodo", rows: [] }}
        rowKey={(r) => r.name}
        empty="Vuoto"
      />,
    );

    expect(screen.getByText("Vuoto")).toBeInTheDocument();
    expect(screen.queryByText("Prima del periodo")).not.toBeInTheDocument();
  });
});
