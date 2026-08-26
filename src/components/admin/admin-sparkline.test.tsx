import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminSparkline } from "./admin-sparkline";

const FLAT = [
  { date: "2026-08-24", value: 5 },
  { date: "2026-08-25", value: 5 },
  { date: "2026-08-26", value: 5 },
];

describe("AdminSparkline", () => {
  it("disegna un punto per ogni giorno della serie", () => {
    render(<AdminSparkline points={FLAT} label="Nuovi utenti" />);

    const polyline = screen
      .getByLabelText("Nuovi utenti")
      .querySelector("polyline");
    expect(polyline?.getAttribute("points")?.trim().split(/\s+/)).toHaveLength(
      3,
    );
  });

  it("appiattisce a metà altezza una serie costante invece di dividere per zero", () => {
    render(<AdminSparkline points={FLAT} label="Nuovi utenti" />);

    const points = screen
      .getByLabelText("Nuovi utenti")
      .querySelector("polyline")
      ?.getAttribute("points");
    const ys = points
      ?.trim()
      .split(/\s+/)
      .map((p) => p.split(",")[1]);
    expect(new Set(ys).size).toBe(1);
  });

  it("mette il valore più alto in cima e il più basso in fondo", () => {
    render(
      <AdminSparkline
        points={[
          { date: "2026-08-24", value: 0 },
          { date: "2026-08-25", value: 10 },
        ]}
        label="Nuovi utenti"
      />,
    );

    const [first, second] = (
      screen
        .getByLabelText("Nuovi utenti")
        .querySelector("polyline")
        ?.getAttribute("points") ?? ""
    )
      .trim()
      .split(/\s+/)
      .map((p) => Number(p.split(",")[1]));
    // Coordinate SVG: y cresce verso il basso, quindi il massimo ha y minore.
    expect(second).toBeLessThan(first);
  });

  it("non rende nulla con una serie vuota (niente SVG degenere)", () => {
    const { container } = render(
      <AdminSparkline points={[]} label="Nuovi utenti" />,
    );

    expect(container.querySelector("svg")).toBeNull();
  });

  it("espone la label come nome accessibile del grafico", () => {
    render(<AdminSparkline points={FLAT} label="Incasso" />);

    expect(screen.getByLabelText("Incasso")).toBeInTheDocument();
  });
});
