import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { format } from "date-fns";
import { SaleLookupDialog } from "./sale-lookup-dialog";
import { findSaleForReturn } from "@/server/storico-actions";
import type { ReceiptListItem } from "@/types/storico";

vi.mock("@/server/storico-actions", () => ({ findSaleForReturn: vi.fn() }));

// Il pannello del reso ha la sua suite: qui conta che riceva la vendita
// trovata e che le sue uscite arrivino al parent.
vi.mock("./return-receipt-panel", () => ({
  ReturnReceiptPanel: (props: {
    receipt: ReceiptListItem;
    onBack: () => void;
    onClose: () => void;
    onReturned: (saleId: string) => void;
  }) => (
    <div data-testid="return-panel">
      <span>{props.receipt.adeProgressive}</span>
      <button type="button" onClick={props.onBack}>
        Indietro
      </button>
      <button type="button" onClick={() => props.onReturned(props.receipt.id)}>
        Reso fatto
      </button>
    </div>
  ),
}));

const BIZ = "11111111-1111-4111-8111-111111111111";

const SALE = {
  origin: "local",
  id: "sale-doc-uuid",
  kind: "SALE",
  status: "ACCEPTED",
  adeProgressive: "DCW2026/5111-2188",
} as unknown as ReceiptListItem;

function renderDialog() {
  const onClose = vi.fn();
  const onReturned = vi.fn();
  render(
    <SaleLookupDialog
      businessId={BIZ}
      printProfile={null}
      onClose={onClose}
      onReturned={onReturned}
    />,
  );
  return { onClose, onReturned };
}

function search(number: string, date?: string) {
  fireEvent.change(screen.getByLabelText("Numero documento"), {
    target: { value: number },
  });
  if (date) {
    fireEvent.change(screen.getByLabelText("Data dello scontrino"), {
      target: { value: date },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: "Cerca" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SaleLookupDialog", () => {
  it("propone la data di oggi e cerca col numero e la data digitati", async () => {
    vi.mocked(findSaleForReturn).mockResolvedValue({ item: SALE });
    renderDialog();

    expect(screen.getByLabelText("Data dello scontrino")).toHaveValue(
      format(new Date(), "yyyy-MM-dd"),
    );
    search("DCW2026/5111-2188", "2026-02-15");

    await waitFor(() =>
      expect(findSaleForReturn).toHaveBeenCalledWith(BIZ, {
        number: "DCW2026/5111-2188",
        date: "2026-02-15",
      }),
    );
  });

  it("trovata la vendita, mostra il pannello del reso", async () => {
    vi.mocked(findSaleForReturn).mockResolvedValue({ item: SALE });
    renderDialog();

    search("5111-2188");

    expect(await screen.findByTestId("return-panel")).toHaveTextContent(
      "DCW2026/5111-2188",
    );
    expect(screen.queryByLabelText("Numero documento")).not.toBeInTheDocument();
  });

  it("senza vendita mostra il motivo e lascia correggere il numero", async () => {
    vi.mocked(findSaleForReturn).mockResolvedValue({
      error: "Nessuno scontrino con questo numero in questa data.",
    });
    renderDialog();

    search("5111-2189");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nessuno scontrino con questo numero in questa data.",
    );
    expect(screen.getByLabelText("Numero documento")).toHaveValue("5111-2189");
  });

  it("dal pannello si torna alla ricerca, col numero ancora scritto", async () => {
    vi.mocked(findSaleForReturn).mockResolvedValue({ item: SALE });
    renderDialog();
    search("5111-2188");
    await screen.findByTestId("return-panel");

    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));

    expect(screen.getByLabelText("Numero documento")).toHaveValue("5111-2188");
  });

  it("a reso fatto passa al parent la vendita resa", async () => {
    vi.mocked(findSaleForReturn).mockResolvedValue({ item: SALE });
    const { onReturned } = renderDialog();
    search("5111-2188");
    await screen.findByTestId("return-panel");

    fireEvent.click(screen.getByRole("button", { name: "Reso fatto" }));

    expect(onReturned).toHaveBeenCalledWith("sale-doc-uuid");
  });

  it("Esc chiude il dialog", () => {
    const { onClose } = renderDialog();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Annulla chiude senza cercare", () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(findSaleForReturn).not.toHaveBeenCalled();
  });
});
