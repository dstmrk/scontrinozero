import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SpidConnectButton } from "./spid-connect-button";

const mockConnectAdeWithSpid = vi.fn();
vi.mock("@/server/onboarding-actions", () => ({
  connectAdeWithSpid: (id: string, header: string) =>
    mockConnectAdeWithSpid(id, header),
}));

const mockIsNativeShell = vi.fn();
vi.mock("@/lib/native/native-shell", () => ({
  useIsNativeShell: () => mockIsNativeShell(),
  getCapacitorBridge: () => ({ isNativePlatform: () => true }),
}));

const mockCapture = vi.fn();
vi.mock("@/lib/native/spid-capture", () => ({
  captureSpidCookieHeader: () => mockCapture(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockIsNativeShell.mockReturnValue(true);
  mockCapture.mockResolvedValue("JSESSIONID=abc");
  mockConnectAdeWithSpid.mockResolvedValue({ businessId: "biz-1" });
});

describe("SpidConnectButton", () => {
  it("fuori dall'app nativa non rende niente", () => {
    mockIsNativeShell.mockReturnValue(false);

    const { container } = render(<SpidConnectButton businessId="biz-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("nell'app mostra il pulsante con l'etichetta data", () => {
    render(<SpidConnectButton businessId="biz-1" label="Ricollega con SPID" />);

    expect(
      screen.getByRole("button", { name: "Ricollega con SPID" }),
    ).toBeInTheDocument();
  });

  it("cattura i cookie, li passa a connectAdeWithSpid e avvisa il chiamante", async () => {
    const onConnected = vi.fn();
    render(<SpidConnectButton businessId="biz-7" onConnected={onConnected} />);

    fireEvent.click(screen.getByRole("button", { name: "Collega con SPID" }));

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith({ businessId: "biz-1" });
    });
    expect(mockConnectAdeWithSpid).toHaveBeenCalledWith(
      "biz-7",
      "JSESSIONID=abc",
    );
  });

  it("browser chiuso prima del DCO: avviso informativo, nessuna chiamata", async () => {
    // L'utente può aver fatto login e secondo fattore: chiudere senza dire
    // niente lo lascia senza esito.
    mockCapture.mockResolvedValue(null);
    const onConnected = vi.fn();
    render(<SpidConnectButton businessId="biz-1" onConnected={onConnected} />);

    fireEvent.click(screen.getByRole("button", { name: "Collega con SPID" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      'Collegamento non completato: dopo l\'accesso SPID apri "Documento commerciale online".',
    );
    expect(mockConnectAdeWithSpid).not.toHaveBeenCalled();
    expect(onConnected).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un nuovo tentativo toglie l'avviso", async () => {
    mockCapture.mockResolvedValueOnce(null);
    render(<SpidConnectButton businessId="biz-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Collega con SPID" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();

    // findBy, non getBy: setNotice dopo l'await esce dalla transition e
    // l'avviso compare un render prima che isPending torni false.
    fireEvent.click(
      await screen.findByRole("button", { name: "Collega con SPID" }),
    );
    await waitFor(() => {
      expect(mockConnectAdeWithSpid).toHaveBeenCalled();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("un errore del server compare sotto il pulsante e non chiama onConnected", async () => {
    mockConnectAdeWithSpid.mockResolvedValue({
      error: "Sessione SPID non valida.",
    });
    const onConnected = vi.fn();
    render(<SpidConnectButton businessId="biz-1" onConnected={onConnected} />);

    fireEvent.click(screen.getByRole("button", { name: "Collega con SPID" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sessione SPID non valida.",
    );
    expect(onConnected).not.toHaveBeenCalled();
  });

  it("un errore del plugin diventa un messaggio, non un crash", async () => {
    mockCapture.mockRejectedValue(new Error("plugin assente"));
    render(<SpidConnectButton businessId="biz-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Collega con SPID" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /aggiorna l'app/i,
    );
  });

  it("durante il collegamento il pulsante è disabilitato", async () => {
    let release: (v: string) => void = () => {};
    mockCapture.mockReturnValue(
      new Promise<string>((r) => {
        release = r;
      }),
    );
    render(<SpidConnectButton businessId="biz-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Collega con SPID" }));

    expect(
      await screen.findByRole("button", { name: /in corso/i }),
    ).toBeDisabled();
    release("JSESSIONID=abc");
    await waitFor(() => {
      expect(mockConnectAdeWithSpid).toHaveBeenCalled();
    });
  });
});
