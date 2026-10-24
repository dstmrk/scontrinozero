import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrialExpiredMessage } from "./trial-expired-message";
import { MemberRoleProvider } from "@/components/dashboard/member-role";

let mockNative = false;
vi.mock("@/lib/native/native-shell", () => ({
  useIsNativeShell: () => mockNative,
}));

beforeEach(() => {
  mockNative = false;
});

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

  it("nel guscio nativo: solo la constatazione, senza link né invito", () => {
    mockNative = true;
    const { container } = render(<TrialExpiredMessage />);
    expect(container).toHaveTextContent(
      /^Il tuo periodo di prova è scaduto\.$/,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("al collaboratore: la prova è dell'attività e il piano lo attiva il titolare", () => {
    const { container } = render(
      <MemberRoleProvider role="collaborator">
        <TrialExpiredMessage />
      </MemberRoleProvider>,
    );
    expect(container).toHaveTextContent(
      "Il periodo di prova dell'attività è scaduto: chiedi al titolare di attivare un piano.",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
