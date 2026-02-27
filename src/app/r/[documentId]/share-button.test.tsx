import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { ShareButton } from "./share-button";

// vi.stubGlobal sostituisce globalThis.navigator (= window.navigator in jsdom).
// vi.unstubAllGlobals() in afterEach ripristina il valore originale.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ShareButton", () => {
  it("renderizza il bottone con il testo predefinito", () => {
    render(<ShareButton url="/r/doc-123" title="Test" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("Condividi ricevuta")).toBeInTheDocument();
  });

  it("chiama navigator.share con l'URL completo quando disponibile", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: mockShare });

    render(<ShareButton url="/r/doc-123" title="La tua ricevuta" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("/r/doc-123"),
          title: "La tua ricevuta",
        }),
      );
    });
  });

  it("non chiama clipboard se navigator.share ha successo", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: mockShare,
      clipboard: { writeText: mockWriteText },
    });

    render(<ShareButton url="/r/doc-123" title="Test" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(mockShare).toHaveBeenCalled());
    expect(mockWriteText).not.toHaveBeenCalled();
  });

  it("cade su clipboard se navigator.share non è disponibile", async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: undefined,
      clipboard: { writeText: mockWriteText },
    });

    render(<ShareButton url="/r/doc-123" title="Test" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(
        expect.stringContaining("/r/doc-123"),
      );
    });
  });

  it("mostra 'Link copiato!' dopo clipboard.writeText riuscito", async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: undefined,
      clipboard: { writeText: mockWriteText },
    });

    render(<ShareButton url="/r/doc-123" title="Test" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Link copiato!")).toBeInTheDocument();
    });
  });

  it("cade su clipboard se navigator.share lancia un'eccezione (utente annulla)", async () => {
    const mockShare = vi.fn().mockRejectedValue(new Error("AbortError"));
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: mockShare,
      clipboard: { writeText: mockWriteText },
    });

    render(<ShareButton url="/r/doc-123" title="Test" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalled();
    });
  });

  it("torna al testo originale dopo 2 secondi", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: undefined,
      clipboard: { writeText: mockWriteText },
    });

    render(<ShareButton url="/r/doc-123" title="Test" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Link copiato!")).toBeInTheDocument();
    });

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(screen.getByText("Condividi ricevuta")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
