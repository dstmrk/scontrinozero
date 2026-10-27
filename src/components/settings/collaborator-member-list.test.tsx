import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeCollaborator } from "@/server/collaborator-actions";
import {
  CollaboratorMemberList,
  type MemberRow,
} from "./collaborator-member-list";

vi.mock("@/server/collaborator-actions", () => ({
  removeCollaborator: vi.fn(),
}));

const BIZ = "11111111-1111-4111-8111-111111111111";
const ANNA: MemberRow = {
  id: "m-1",
  name: "Anna Bianchi",
  email: "anna@example.com",
  lastSeenLabel: "26/10/2026",
};

function renderList(members: MemberRow[] = [ANNA]) {
  const onFeedback = vi.fn();
  render(
    <CollaboratorMemberList
      businessId={BIZ}
      members={members}
      onFeedback={onFeedback}
    />,
  );
  return { onFeedback };
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  vi.mocked(removeCollaborator).mockResolvedValue({});
});

describe("CollaboratorMemberList", () => {
  it("mostra nome, email e ultimo accesso", () => {
    renderList();

    const list = screen.getByRole("list", { name: "Collaboratori attivi" });
    expect(list).toHaveTextContent("Anna Bianchi");
    expect(list).toHaveTextContent("anna@example.com");
    expect(list).toHaveTextContent("ultimo accesso il 26/10/2026");
  });

  it("senza accessi registrati lo dice", () => {
    renderList([{ ...ANNA, lastSeenLabel: null }]);

    expect(screen.getByText(/nessun accesso registrato/)).toBeInTheDocument();
  });

  it("chiede conferma prima di rimuovere, poi rimuove", async () => {
    const { onFeedback } = renderList();

    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi Anna Bianchi" }),
    );
    expect(
      await screen.findByText("Rimuovere Anna Bianchi?"),
    ).toBeInTheDocument();
    expect(removeCollaborator).not.toHaveBeenCalled();
    expect(screen.getByText(/restano nello storico/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rimuovi" }));

    await waitFor(() =>
      expect(removeCollaborator).toHaveBeenCalledWith(BIZ, "m-1"),
    );
    await waitFor(() =>
      expect(onFeedback).toHaveBeenCalledWith({
        kind: "status",
        text: "Accesso di Anna Bianchi rimosso.",
      }),
    );
    expect(
      screen.queryByText("Rimuovere Anna Bianchi?"),
    ).not.toBeInTheDocument();
  });

  it("annulla senza rimuovere", async () => {
    renderList();

    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi Anna Bianchi" }),
    );
    await screen.findByText("Rimuovere Anna Bianchi?");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    expect(removeCollaborator).not.toHaveBeenCalled();
  });

  it("Esc chiude la conferma senza rimuovere", async () => {
    renderList();

    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi Anna Bianchi" }),
    );
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(removeCollaborator).not.toHaveBeenCalled();
  });

  it("se la rimozione fallisce lo dice", async () => {
    vi.mocked(removeCollaborator).mockResolvedValue({
      error:
        "Non siamo riusciti a rimuovere il collaboratore. Riprova tra qualche minuto.",
    });
    const { onFeedback } = renderList();

    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi Anna Bianchi" }),
    );
    await screen.findByText("Rimuovere Anna Bianchi?");
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi" }));

    await waitFor(() =>
      expect(onFeedback).toHaveBeenCalledWith({
        kind: "alert",
        text: "Non siamo riusciti a rimuovere il collaboratore. Riprova tra qualche minuto.",
      }),
    );
  });

  it("senza nome usa l'email", () => {
    renderList([{ ...ANNA, name: null }]);

    expect(
      screen.getByRole("button", { name: "Rimuovi anna@example.com" }),
    ).toBeInTheDocument();
  });

  it("senza collaboratori non mostra nulla", () => {
    renderList([]);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
