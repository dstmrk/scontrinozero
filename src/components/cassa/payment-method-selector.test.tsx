import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PaymentMethodSelector } from "./payment-method-selector";

describe("PaymentMethodSelector", () => {
  it("renderizza l'opzione Contanti", () => {
    render(<PaymentMethodSelector value="PC" onChange={vi.fn()} />);
    expect(screen.getByText("Contanti")).toBeInTheDocument();
  });

  it("renderizza l'opzione Carta", () => {
    render(<PaymentMethodSelector value="PC" onChange={vi.fn()} />);
    expect(screen.getByText("Carta")).toBeInTheDocument();
  });

  it("l'opzione selezionata ha aria-pressed=true", () => {
    render(<PaymentMethodSelector value="PC" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /contanti/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("l'opzione non selezionata ha aria-pressed=false", () => {
    render(<PaymentMethodSelector value="PC" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /carta/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("chiama onChange con 'PE' quando si preme Carta", () => {
    const onChange = vi.fn();
    render(<PaymentMethodSelector value="PC" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /carta/i }));

    expect(onChange).toHaveBeenCalledWith("PE");
  });

  it("chiama onChange con 'PC' quando si preme Contanti", () => {
    const onChange = vi.fn();
    render(<PaymentMethodSelector value="PE" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /contanti/i }));

    expect(onChange).toHaveBeenCalledWith("PC");
  });

  it("aggiorna la selezione visiva al cambio di value", () => {
    const { rerender } = render(
      <PaymentMethodSelector value="PC" onChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /carta/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    rerender(<PaymentMethodSelector value="PE" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /carta/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /contanti/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
