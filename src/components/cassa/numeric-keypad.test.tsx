import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NumericKeypad } from "./numeric-keypad";

describe("NumericKeypad", () => {
  it("renderizza tutti i tasti numerici 0-9", () => {
    render(<NumericKeypad value={0} onChange={vi.fn()} />);

    for (let i = 0; i <= 9; i++) {
      expect(
        screen.getByRole("button", { name: String(i) }),
      ).toBeInTheDocument();
    }
  });

  it("renderizza il tasto 00", () => {
    render(<NumericKeypad value={0} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "00" })).toBeInTheDocument();
  });

  it("renderizza il tasto backspace", () => {
    render(<NumericKeypad value={0} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /backspace|⌫|cancella/i }),
    ).toBeInTheDocument();
  });

  it.each([
    {
      name: "chiama onChange con centesimi corretti premendo una cifra (0 → 7 = 7)",
      value: 0,
      button: "7",
      expected: 7,
    },
    {
      name: "aggiunge cifra al valore esistente cashier-style (13 → '5' = 135)",
      value: 13,
      button: "5",
      expected: 135,
    },
    {
      name: "chiama onChange con backspace cashier-style (1358 → 135)",
      value: 1358,
      button: /backspace|⌫|cancella/i,
      expected: 135,
    },
    {
      name: "backspace su 0 rimane 0",
      value: 0,
      button: /backspace|⌫|cancella/i,
      expected: 0,
    },
    {
      name: "tasto 00 aggiunge due zeri (5 → 500)",
      value: 5,
      button: "00",
      expected: 500,
    },
    { name: "tasto 00 su 0 rimane 0", value: 0, button: "00", expected: 0 },
    {
      name: "non supera il massimo di 999999 centesimi",
      value: 999999,
      button: "1",
      expected: 999999,
    },
    {
      name: "aggiunge zero premendo il tasto 0 (10 → 100)",
      value: 10,
      button: "0",
      expected: 100,
    },
  ] as {
    name: string;
    value: number;
    button: string | RegExp;
    expected: number;
  }[])("$name", ({ value, button, expected }) => {
    const onChange = vi.fn();
    render(<NumericKeypad value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: button }));

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("sequenza 1→3→5→8 produce 1358 centesimi (€13,58)", () => {
    const results: number[] = [];
    const onChange = vi.fn().mockImplementation((v: number) => results.push(v));

    const { rerender } = render(
      <NumericKeypad value={0} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "1" }));

    rerender(<NumericKeypad value={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "3" }));

    rerender(<NumericKeypad value={13} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    rerender(<NumericKeypad value={135} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "8" }));

    expect(results).toEqual([1, 13, 135, 1358]);
  });
});
