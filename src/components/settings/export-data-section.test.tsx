import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemberRoleProvider } from "@/components/dashboard/member-role";
import {
  exportCollaboratorData,
  exportUserData,
} from "@/server/export-actions";
import { ExportDataSection } from "./export-data-section";

vi.mock("@/server/export-actions", () => ({
  exportUserData: vi.fn(),
  exportCollaboratorData: vi.fn(),
}));

function renderSection(role: "owner" | "collaborator") {
  return render(
    <MemberRoleProvider role={role}>
      <ExportDataSection />
    </MemberRoleProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:export");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.mocked(exportUserData).mockResolvedValue({
    data: { exportedAt: "2026-10-27T10:00:00Z" } as never,
  });
  vi.mocked(exportCollaboratorData).mockResolvedValue({
    data: { exportedAt: "2026-10-27T10:00:00Z" } as never,
  });
});

describe("ExportDataSection", () => {
  it("il titolare scarica attività, scontrini e catalogo", async () => {
    renderSection("owner");

    expect(
      screen.getByText(/attività, scontrini, catalogo/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Esporta dati" }));

    await waitFor(() => expect(exportUserData).toHaveBeenCalled());
    expect(exportCollaboratorData).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("il collaboratore scarica i suoi dati personali", async () => {
    renderSection("collaborator");

    expect(screen.getByText(/li esporta il titolare/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Esporta dati" }));

    await waitFor(() => expect(exportCollaboratorData).toHaveBeenCalled());
    expect(exportUserData).not.toHaveBeenCalled();
  });

  it("mostra l'errore dell'export", async () => {
    vi.mocked(exportCollaboratorData).mockResolvedValue({
      error: "Nessun dato da collaboratore per questo account.",
    });
    renderSection("collaborator");

    fireEvent.click(screen.getByRole("button", { name: "Esporta dati" }));

    expect(
      await screen.findByText(
        "Nessun dato da collaboratore per questo account.",
      ),
    ).toBeInTheDocument();
  });

  it("se l'export lancia mostra un errore generico", async () => {
    vi.mocked(exportUserData).mockRejectedValue(new Error("network"));
    renderSection("owner");

    fireEvent.click(screen.getByRole("button", { name: "Esporta dati" }));

    expect(
      await screen.findByText("Si è verificato un errore. Riprova più tardi."),
    ).toBeInTheDocument();
  });
});
