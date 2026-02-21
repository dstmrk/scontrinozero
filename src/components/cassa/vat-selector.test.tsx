import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VatSelector } from "./vat-selector";

describe("VatSelector", () => {
  it("renderizza tutte e 4 le aliquote IVA", () => {
    render(<VatSelector value="22" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "4%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "22%" })).toBeInTheDocument();
  });

  it("il bottone selezionato ha aria-pressed=true", () => {
    render(<VatSelector value="10" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "10%" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("i bottoni non selezionati hanno aria-pressed=false", () => {
    render(<VatSelector value="10" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "22%" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "4%" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("chiama onChange con il codice IVA corretto quando si preme un bottone", () => {
    const onChange = vi.fn();
    render(<VatSelector value="22" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "10%" }));

    expect(onChange).toHaveBeenCalledWith("10");
  });

  it("chiama onChange con '4' quando si preme 4%", () => {
    const onChange = vi.fn();
    render(<VatSelector value="22" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "4%" }));

    expect(onChange).toHaveBeenCalledWith("4");
  });

  it("chiama onChange con '5' quando si preme 5%", () => {
    const onChange = vi.fn();
    render(<VatSelector value="22" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "5%" }));

    expect(onChange).toHaveBeenCalledWith("5");
  });

  it("chiama onChange con '22' quando si preme 22%", () => {
    const onChange = vi.fn();
    render(<VatSelector value="10" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "22%" }));

    expect(onChange).toHaveBeenCalledWith("22");
  });

  it("aggiorna la selezione visiva al cambio di value", () => {
    const { rerender } = render(<VatSelector value="22" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "22%" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    rerender(<VatSelector value="5" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "5%" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "22%" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
