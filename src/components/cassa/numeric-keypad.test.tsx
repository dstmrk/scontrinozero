import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NumericKeypad } from "./numeric-keypad";

describe("NumericKeypad", () => {
  it("renderizza tutti i tasti numerici 0-9", () => {
    render(<NumericKeypad value="" onChange={vi.fn()} />);

    for (let i = 0; i <= 9; i++) {
      expect(
        screen.getByRole("button", { name: String(i) }),
      ).toBeInTheDocument();
    }
  });

  it("renderizza il tasto punto decimale", () => {
    render(<NumericKeypad value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "," })).toBeInTheDocument();
  });

  it("renderizza il tasto backspace", () => {
    render(<NumericKeypad value="" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /backspace|⌫|cancella/i }),
    ).toBeInTheDocument();
  });

  it("chiama onChange con la cifra aggiunta premendo un tasto numerico", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "7" }));

    expect(onChange).toHaveBeenCalledWith("7");
  });

  it("aggiunge cifra al valore esistente", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value="12" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    expect(onChange).toHaveBeenCalledWith("123");
  });

  it("chiama onChange con valore senza ultima cifra premendo backspace", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value="123" onChange={onChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: /backspace|⌫|cancella/i }),
    );

    expect(onChange).toHaveBeenCalledWith("12");
  });

  it("chiama onChange con stringa vuota premendo backspace su singolo carattere", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value="5" onChange={onChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: /backspace|⌫|cancella/i }),
    );

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("aggiunge il punto decimale", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value="12" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "," }));

    expect(onChange).toHaveBeenCalledWith("12.");
  });

  it("il tasto decimale è disabilitato se il valore ha già un punto", () => {
    render(<NumericKeypad value="12.5" onChange={vi.fn()} />);

    const decimalBtn = screen.getByRole("button", { name: "," });
    expect(decimalBtn).toBeDisabled();
  });

  it("non aggiunge cifre oltre 2 decimali", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value="12.50" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("aggiunge '0.' premendo il decimale su stringa vuota", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "," }));

    expect(onChange).toHaveBeenCalledWith("0.");
  });

  it("sostituisce lo zero iniziale con la cifra premuta", () => {
    const onChange = vi.fn();
    render(<NumericKeypad value="0" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(onChange).toHaveBeenCalledWith("5");
  });
});
