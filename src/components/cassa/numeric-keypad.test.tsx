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

  it("chiama onChange con centesimi corretti premendo una cifra (0 → 7 = 7)", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value={0} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "7" }));

    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("aggiunge cifra al valore esistente cashier-style (13 → '5' = 135)", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value={13} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(onChange).toHaveBeenCalledWith(135);
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

  it("chiama onChange con backspace cashier-style (1358 → 135)", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value={1358} onChange={onChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: /backspace|⌫|cancella/i }),
    );

    expect(onChange).toHaveBeenCalledWith(135);
  });

  it("backspace su 0 rimane 0", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value={0} onChange={onChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: /backspace|⌫|cancella/i }),
    );

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("tasto 00 aggiunge due zeri (5 → 500)", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value={5} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "00" }));

    expect(onChange).toHaveBeenCalledWith(500);
  });

  it("tasto 00 su 0 rimane 0", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value={0} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "00" }));

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("non supera il massimo di 999999 centesimi", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value={999999} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "1" }));

    expect(onChange).toHaveBeenCalledWith(999999);
  });

  it("aggiunge zero premendo il tasto 0 (10 → 100)", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value={10} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "0" }));

    expect(onChange).toHaveBeenCalledWith(100);
  });
});
