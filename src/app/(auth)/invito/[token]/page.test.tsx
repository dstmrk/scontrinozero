import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadInviteView } = vi.hoisted(() => ({
  mockReadInviteView: vi.fn(),
}));

vi.mock("./invite-view", () => ({ readInviteView: mockReadInviteView }));
// Form e avviso hanno le loro suite: qui conta quale dei due la pagina monta.
vi.mock("./accept-invite-form", () => ({
  AcceptInviteForm: (props: {
    token: string;
    email: string;
    businessName: string | null;
  }) => (
    <div data-testid="form">
      {props.token}|{props.email}|{props.businessName}
    </div>
  ),
}));
vi.mock("./invite-unavailable", () => ({
  InviteUnavailable: ({ view }: { view: { kind: string } }) => (
    <div data-testid="unavailable">{view.kind}</div>
  ),
}));

import InvitePage from "./page";

const TOKEN = "a".repeat(43);

async function renderPage() {
  render(await InvitePage({ params: Promise.resolve({ token: TOKEN }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InvitePage", () => {
  it("con un invito valido monta il form con token, email e attività", async () => {
    mockReadInviteView.mockResolvedValue({
      kind: "valid",
      invite: {
        id: "inv-1",
        businessId: "11111111-1111-4111-8111-111111111111",
        email: "anna@example.com",
        expiresAt: new Date(),
        businessName: "Bar Centrale",
      },
    });

    await renderPage();

    expect(mockReadInviteView).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByTestId("form")).toHaveTextContent(
      `${TOKEN}|anna@example.com|Bar Centrale`,
    );
  });

  it.each(["missing", "expired", "error"])(
    "con un invito %s monta l'avviso e non il form",
    async (kind) => {
      mockReadInviteView.mockResolvedValue({ kind, businessName: null });

      await renderPage();

      expect(screen.getByTestId("unavailable")).toHaveTextContent(kind);
      expect(screen.queryByTestId("form")).not.toBeInTheDocument();
    },
  );
});
