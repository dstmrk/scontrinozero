import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BottomNav } from "./bottom-nav";

// --- Mocks ---

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// --- Tests ---

describe("BottomNav", () => {
  it("renderizza i 4 link di navigazione", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<BottomNav />);

    expect(screen.getByText("Catalogo")).toBeInTheDocument();
    expect(screen.getByText("Cassa")).toBeInTheDocument();
    expect(screen.getByText("Storico")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
  });

  it("i link puntano agli href corretti", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<BottomNav />);

    expect(screen.getByText("Catalogo").closest("a")).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByText("Cassa").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/cassa",
    );
    expect(screen.getByText("Storico").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/storico",
    );
    expect(screen.getByText("Analytics").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/analytics",
    );
  });

  it("Catalogo è attivo su /dashboard (match esatto)", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<BottomNav />);

    const cataloLink = screen.getByText("Catalogo").closest("a");
    expect(cataloLink?.className).toContain("text-primary");
  });

  it("Cassa è attivo su /dashboard/cassa", () => {
    mockUsePathname.mockReturnValue("/dashboard/cassa");
    render(<BottomNav />);

    const cassaLink = screen.getByText("Cassa").closest("a");
    expect(cassaLink?.className).toContain("text-primary");
  });

  it("Catalogo NON è attivo su /dashboard/cassa (match esatto, non prefix)", () => {
    mockUsePathname.mockReturnValue("/dashboard/cassa");
    render(<BottomNav />);

    const cataloLink = screen.getByText("Catalogo").closest("a");
    expect(cataloLink?.className).not.toContain("text-primary");
  });

  it("Storico è attivo su /dashboard/storico", () => {
    mockUsePathname.mockReturnValue("/dashboard/storico");
    render(<BottomNav />);

    const storicoLink = screen.getByText("Storico").closest("a");
    expect(storicoLink?.className).toContain("text-primary");
  });

  it("Analytics è attivo su /dashboard/analytics", () => {
    mockUsePathname.mockReturnValue("/dashboard/analytics");
    render(<BottomNav />);

    const analyticsLink = screen.getByText("Analytics").closest("a");
    expect(analyticsLink?.className).toContain("text-primary");
  });
});
