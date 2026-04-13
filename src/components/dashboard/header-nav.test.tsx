import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HeaderNav } from "./header-nav";

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

describe("HeaderNav", () => {
  it("renderizza i 4 link di navigazione", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<HeaderNav />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Cassa")).toBeInTheDocument();
    expect(screen.getByText("Storico")).toBeInTheDocument();
    expect(screen.getByText("Impostazioni")).toBeInTheDocument();
  });

  it("i link puntano agli href corretti", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<HeaderNav />);

    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute(
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
    expect(screen.getByText("Impostazioni").closest("a")).toHaveAttribute(
      "href",
      "/dashboard/settings",
    );
  });

  it("Dashboard è attivo su /dashboard (match esatto)", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    render(<HeaderNav />);

    const dashLink = screen.getByText("Dashboard").closest("a");
    expect(dashLink?.className).toContain("font-semibold");
    expect(dashLink?.className).toContain("text-foreground");
  });

  it("Dashboard NON è attivo su /dashboard/cassa (match esatto, non prefix)", () => {
    mockUsePathname.mockReturnValue("/dashboard/cassa");
    render(<HeaderNav />);

    const dashLink = screen.getByText("Dashboard").closest("a");
    expect(dashLink?.className).not.toContain("font-semibold");
    expect(dashLink?.className).toContain("text-muted-foreground");
  });

  it("Cassa è attivo su /dashboard/cassa", () => {
    mockUsePathname.mockReturnValue("/dashboard/cassa");
    render(<HeaderNav />);

    const cassaLink = screen.getByText("Cassa").closest("a");
    expect(cassaLink?.className).toContain("font-semibold");
    expect(cassaLink?.className).toContain("text-foreground");
  });

  it("Storico è attivo su /dashboard/storico", () => {
    mockUsePathname.mockReturnValue("/dashboard/storico");
    render(<HeaderNav />);

    const storicoLink = screen.getByText("Storico").closest("a");
    expect(storicoLink?.className).toContain("font-semibold");
    expect(storicoLink?.className).toContain("text-foreground");
  });

  it("Impostazioni è attivo su /dashboard/settings", () => {
    mockUsePathname.mockReturnValue("/dashboard/settings");
    render(<HeaderNav />);

    const settingsLink = screen.getByText("Impostazioni").closest("a");
    expect(settingsLink?.className).toContain("font-semibold");
    expect(settingsLink?.className).toContain("text-foreground");
  });

  it("solo un link è attivo alla volta", () => {
    mockUsePathname.mockReturnValue("/dashboard/storico");
    render(<HeaderNav />);

    const links = screen
      .getAllByRole("link")
      .filter((l) => l.className.includes("font-semibold"));
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("Storico");
  });

  it("i link inattivi hanno classe text-muted-foreground", () => {
    mockUsePathname.mockReturnValue("/dashboard/cassa");
    render(<HeaderNav />);

    const inactiveLinks = ["Dashboard", "Storico", "Impostazioni"];
    for (const label of inactiveLinks) {
      const link = screen.getByText(label).closest("a");
      expect(link?.className).toContain("text-muted-foreground");
    }
  });
});
