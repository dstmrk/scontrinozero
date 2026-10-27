import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptCollaboratorTerms,
  inviteCollaborator,
  revokeCollaboratorInvite,
} from "@/server/collaborator-actions";
import type { OwnerInviteBlocker } from "@/lib/collaborator-invites";
import { CollaboratorsSection, type InviteRow } from "./collaborators-section";

vi.mock("@/server/collaborator-actions", () => ({
  acceptCollaboratorTerms: vi.fn(),
  inviteCollaborator: vi.fn(),
  revokeCollaboratorInvite: vi.fn(),
  removeCollaborator: vi.fn(),
}));

const BIZ = "11111111-1111-4111-8111-111111111111";

const PENDING: InviteRow = {
  id: "inv-1",
  email: "luca@example.com",
  expired: false,
  expiresLabel: "31/10/2026",
};
const EXPIRED: InviteRow = {
  id: "inv-2",
  email: "sara@example.com",
  expired: true,
  expiresLabel: "20/10/2026",
};

function renderSection(
  props: Partial<{
    blocker: OwnerInviteBlocker | null;
    trialLimit: number | null;
    members: {
      id: string;
      name: string | null;
      email: string | null;
      lastSeenLabel: string | null;
    }[];
    invites: InviteRow[];
  }> = {},
) {
  return render(
    <CollaboratorsSection
      businessId={BIZ}
      blocker={props.blocker ?? null}
      trialLimit={props.trialLimit ?? null}
      members={props.members ?? []}
      invites={props.invites ?? []}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(inviteCollaborator).mockResolvedValue({});
  vi.mocked(revokeCollaboratorInvite).mockResolvedValue({});
  vi.mocked(acceptCollaboratorTerms).mockResolvedValue({});
});

describe("CollaboratorsSection", () => {
  it("invita l'email digitata e conferma l'invio", async () => {
    renderSection();

    fireEvent.change(screen.getByLabelText("Email del collaboratore"), {
      target: { value: "anna@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invita" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Invito inviato a anna@example.com.",
    );
    expect(inviteCollaborator).toHaveBeenCalledWith(BIZ, "anna@example.com");
    expect(screen.getByLabelText("Email del collaboratore")).toHaveValue("");
  });

  it("mostra il motivo se l'invito non parte e lascia l'email scritta", async () => {
    const reason =
      "Questa email ha già un account ScontrinoZero: una persona può far parte di una sola attività.";
    vi.mocked(inviteCollaborator).mockResolvedValue({ error: reason });
    renderSection();

    fireEvent.change(screen.getByLabelText("Email del collaboratore"), {
      target: { value: "anna@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invita" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(reason);
    expect(screen.getByLabelText("Email del collaboratore")).toHaveValue(
      "anna@example.com",
    );
  });

  it("nella prova dichiara il limite", () => {
    renderSection({ trialLimit: 2 });

    expect(
      screen.getByText(
        "Durante la prova puoi avere fino a 2 collaboratori, inviti in sospeso compresi. Con Team sono illimitati.",
      ),
    ).toBeInTheDocument();
  });

  it("senza Fisconline verificate spiega il passo e non mostra il form", () => {
    renderSection({
      blocker: {
        step: "fisconline",
        message:
          "Per invitare collaboratori servono credenziali Fisconline verificate.",
      },
    });

    expect(
      screen.getByText(/servono credenziali Fisconline verificate/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Email del collaboratore"),
    ).not.toBeInTheDocument();
  });

  describe("condizioni", () => {
    const TERMS: OwnerInviteBlocker = {
      step: "terms",
      message: "Accetta prima le Condizioni per i collaboratori.",
    };

    it("linka la versione corrente e chiede la spunta prima di accettare", async () => {
      renderSection({ blocker: TERMS });

      expect(
        screen.getByRole("link", { name: "Condizioni per i collaboratori" }),
      ).toHaveAttribute("href", "/condizioni-collaboratori");
      const accept = screen.getByRole("button", { name: "Accetta" });
      expect(accept).toBeDisabled();

      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(accept);

      await waitFor(() =>
        expect(acceptCollaboratorTerms).toHaveBeenCalledWith(BIZ),
      );
      expect(
        screen.queryByLabelText("Email del collaboratore"),
      ).not.toBeInTheDocument();
    });

    it("mostra l'errore se l'accettazione non si registra", async () => {
      vi.mocked(acceptCollaboratorTerms).mockResolvedValue({
        error: "Non autenticato.",
      });
      renderSection({ blocker: TERMS });

      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: "Accetta" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Non autenticato.",
      );
    });
  });

  it("passa i collaboratori alla loro lista", () => {
    renderSection({
      members: [
        {
          id: "m-1",
          name: "Anna Bianchi",
          email: "anna@example.com",
          lastSeenLabel: "26/10/2026",
        },
      ],
    });

    const list = screen.getByRole("list", { name: "Collaboratori attivi" });
    expect(list).toHaveTextContent("Anna Bianchi");
  });

  describe("inviti", () => {
    it("distingue un invito valido da uno scaduto", () => {
      renderSection({ invites: [PENDING, EXPIRED] });

      const list = screen.getByRole("list", { name: "Inviti" });
      expect(list).toHaveTextContent("luca@example.com");
      expect(list).toHaveTextContent("Scade il 31/10/2026");
      expect(list).toHaveTextContent("sara@example.com");
      expect(list).toHaveTextContent("Scaduto");
    });

    it("reinvia allo stesso indirizzo", async () => {
      renderSection({ invites: [EXPIRED] });

      fireEvent.click(
        screen.getByRole("button", { name: "Reinvia a sara@example.com" }),
      );

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Invito inviato a sara@example.com.",
      );
      expect(inviteCollaborator).toHaveBeenCalledWith(BIZ, "sara@example.com");
    });

    it("revoca un invito valido ed elimina uno scaduto", async () => {
      renderSection({ invites: [PENDING, EXPIRED] });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Revoca l'invito a luca@example.com",
        }),
      );
      await waitFor(() =>
        expect(revokeCollaboratorInvite).toHaveBeenCalledWith(BIZ, "inv-1"),
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Elimina l'invito a sara@example.com",
        }),
      );
      await waitFor(() =>
        expect(revokeCollaboratorInvite).toHaveBeenCalledWith(BIZ, "inv-2"),
      );
    });

    it("col piano che non ammette collaboratori si revocano ma non si reinviano", () => {
      renderSection({
        blocker: {
          step: "plan",
          message: "Il piano attuale non include i collaboratori.",
        },
        invites: [PENDING],
      });

      expect(
        screen.getByText("Il piano attuale non include i collaboratori."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Reinvia/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "Revoca l'invito a luca@example.com",
        }),
      ).toBeInTheDocument();
    });
  });
});
