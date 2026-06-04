import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrialExpiredMessage } from "./trial-expired-message";

describe("TrialExpiredMessage", () => {
  it("renders the trial-expired copy", () => {
    render(<TrialExpiredMessage />);
    expect(
      screen.getByText(/il tuo periodo di prova è scaduto/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/per continuare/i)).toBeInTheDocument();
  });

  it('renders "Attiva un piano" as a link to the billing card', () => {
    render(<TrialExpiredMessage />);
    const link = screen.getByRole("link", { name: /attiva un piano/i });
    expect(link).toHaveAttribute("href", "/dashboard/settings#billing");
  });
});
