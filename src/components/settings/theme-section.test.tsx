import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeSection } from "./theme-section";

// --- Mocks ---
// Firma reale di setTheme (string) per evitare TS2556 (regola 16).
const mockSetTheme = vi.fn<(theme: string) => void>();
let mockTheme: string | undefined = "system";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockTheme = "system";
});

// --- Tests ---

describe("ThemeSection", () => {
  it("mostra le tre opzioni di tema", () => {
    render(<ThemeSection />);

    expect(screen.getByRole("button", { name: "Chiaro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scuro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sistema" })).toBeInTheDocument();
  });

  it("espone il gruppo con un nome accessibile", () => {
    render(<ThemeSection />);

    expect(
      screen.getByRole("group", { name: "Tema dell'interfaccia" }),
    ).toBeInTheDocument();
  });

  it("evidenzia l'opzione attiva in base al tema corrente", () => {
    mockTheme = "dark";
    render(<ThemeSection />);

    expect(screen.getByRole("button", { name: "Scuro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Chiaro" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Sistema" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it.each([
    {
      name: "imposta il tema chiaro al click su 'Chiaro'",
      button: "Chiaro",
      theme: "light",
    },
    {
      name: "imposta il tema scuro al click su 'Scuro'",
      button: "Scuro",
      theme: "dark",
    },
    {
      name: "imposta il tema di sistema al click su 'Sistema'",
      button: "Sistema",
      theme: "system",
    },
  ])("$name", ({ button, theme }) => {
    render(<ThemeSection />);

    fireEvent.click(screen.getByRole("button", { name: button }));

    expect(mockSetTheme).toHaveBeenCalledWith(theme);
  });

  it("non evidenzia alcuna opzione quando il tema non è ancora risolto", () => {
    mockTheme = undefined;
    render(<ThemeSection />);

    for (const name of ["Chiaro", "Scuro", "Sistema"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });
});
