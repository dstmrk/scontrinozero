import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminRangeTabs } from "./admin-range-tabs";

describe("AdminRangeTabs", () => {
  it("offre i quattro periodi dell'app, con le stesse etichette", () => {
    render(<AdminRangeTabs active="30d" />);

    expect(screen.getByRole("link", { name: "7 giorni" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "30 giorni" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "90 giorni" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Da inizio anno" }),
    ).toBeInTheDocument();
  });

  it("linka ogni periodo con il proprio ?range=", () => {
    render(<AdminRangeTabs active="30d" />);

    expect(screen.getByRole("link", { name: "7 giorni" })).toHaveAttribute(
      "href",
      "/admin?range=7d",
    );
    expect(
      screen.getByRole("link", { name: "Da inizio anno" }),
    ).toHaveAttribute("href", "/admin?range=ytd");
  });

  it("marca il periodo attivo per gli screen reader", () => {
    render(<AdminRangeTabs active="90d" />);

    expect(screen.getByRole("link", { name: "90 giorni" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "7 giorni" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
