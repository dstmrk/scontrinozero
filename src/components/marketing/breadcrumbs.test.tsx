// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "./breadcrumbs";

const ITEMS = [
  { name: "Home", url: "https://scontrinozero.it" },
  { name: "Guide", url: "https://scontrinozero.it/guide" },
  {
    name: "Documento commerciale online",
    url: "https://scontrinozero.it/guide/documento-commerciale-online",
  },
];

describe("Breadcrumbs", () => {
  it("renders a nav landmark labelled 'breadcrumb'", () => {
    render(<Breadcrumbs items={ITEMS} />);
    expect(
      screen.getByRole("navigation", { name: /breadcrumb/i }),
    ).toBeTruthy();
  });

  it("renders intermediate items as links with relative pathnames (intra-marketing soft routing)", () => {
    render(<Breadcrumbs items={ITEMS} />);
    const home = screen.getByRole("link", { name: "Home" });
    const guide = screen.getByRole("link", { name: "Guide" });
    expect(home.getAttribute("href")).toBe("/");
    expect(guide.getAttribute("href")).toBe("/guide");
  });

  it("renders the last item as current page, not a link", () => {
    render(<Breadcrumbs items={ITEMS} />);
    const last = screen.getByText("Documento commerciale online");
    expect(last.getAttribute("aria-current")).toBe("page");
    expect(
      screen.queryByRole("link", { name: "Documento commerciale online" }),
    ).toBeNull();
  });

  it("preserves item order", () => {
    render(<Breadcrumbs items={ITEMS} />);
    const listItems = screen.getAllByRole("listitem");
    expect(listItems.map((li) => li.textContent)).toEqual([
      "Home",
      "Guide",
      "Documento commerciale online",
    ]);
  });

  it("renders a single item (only Home) as current page", () => {
    render(
      <Breadcrumbs
        items={[{ name: "Home", url: "https://scontrinozero.it" }]}
      />,
    );
    const home = screen.getByText("Home");
    expect(home.getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
