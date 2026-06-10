import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VoidReceiptDialog } from "./void-receipt-dialog";
import type { ReceiptListItem } from "@/types/storico";

vi.mock("@/server/void-actions", () => ({
  voidReceipt: vi.fn(),
}));

// scrollIntoView richiesto da Radix UI Dialog
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
});

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const ACCEPTED_RECEIPT: ReceiptListItem = {
  id: "doc-uuid-123",
  kind: "SALE",
  status: "ACCEPTED",
  adeProgressive: "DCW2026/5111-2188",
  adeTransactionId: "trx-001",
  createdAt: new Date("2026-01-01T10:00:00Z"),
  total: "12.00",
  lines: [
    {
      description: "Caffè espresso",
      quantity: "2",
      grossUnitPrice: "1.20",
      vatCode: "22",
    },
  ],
};

const VOIDED_RECEIPT: ReceiptListItem = {
  ...ACCEPTED_RECEIPT,
  status: "VOID_ACCEPTED",
};

const defaultProps = {
  businessId: "biz-1",
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

describe("VoidReceiptDialog — QR code", () => {
  it("shows 'Mostra QR code' for an ACCEPTED receipt", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    expect(screen.getByText("Mostra QR code")).toBeInTheDocument();
  });

  it("does not show 'Mostra QR code' for a voided receipt", () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={VOIDED_RECEIPT} />,
    );

    expect(screen.queryByText("Mostra QR code")).not.toBeInTheDocument();
  });

  it("switches to the QR view showing the receipt URL on click", async () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Mostra QR code"));
    });

    expect(
      screen.getByText((content) => content.includes("/r/doc-uuid-123")),
    ).toBeInTheDocument();
    expect(screen.getByText(/inquadra il qr code/i)).toBeInTheDocument();
    expect(screen.getByText("Indietro")).toBeInTheDocument();
  });

  it("goes back to the detail view from the QR view", async () => {
    renderWithQuery(
      <VoidReceiptDialog {...defaultProps} receipt={ACCEPTED_RECEIPT} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Mostra QR code"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Indietro"));
    });

    // Back in detail view: the void button is visible again
    expect(screen.getByText("Annulla scontrino")).toBeInTheDocument();
    expect(screen.queryByText("Indietro")).not.toBeInTheDocument();
  });
});
