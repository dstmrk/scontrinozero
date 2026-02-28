import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ReceiptSuccess } from "./receipt-success";

// Mock navigator APIs
const mockShare = vi.fn();
const mockWriteText = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();

  Object.defineProperty(navigator, "share", {
    value: undefined,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });

  mockShare.mockReset();
  mockWriteText.mockReset();
  mockWriteText.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ReceiptSuccess", () => {
  const defaultProps = {
    onNewReceipt: vi.fn(),
  };

  it("renders success heading and date", () => {
    render(<ReceiptSuccess {...defaultProps} />);

    expect(screen.getByText("Scontrino emesso")).toBeInTheDocument();
    expect(screen.getByText("Nuovo scontrino")).toBeInTheDocument();
  });

  it("shows AdE data when adeProgressive is provided", () => {
    render(
      <ReceiptSuccess
        {...defaultProps}
        adeProgressive="DCW2026/5111-2188"
        adeTransactionId="trx-001"
      />,
    );

    expect(screen.getByText("DCW2026/5111-2188")).toBeInTheDocument();
    expect(screen.getByText("trx-001")).toBeInTheDocument();
  });

  it("hides AdE section when neither adeProgressive nor adeTransactionId is provided", () => {
    render(<ReceiptSuccess {...defaultProps} />);

    expect(screen.queryByText("Progressivo AdE")).not.toBeInTheDocument();
  });

  it("shows share button when documentId is provided", () => {
    render(<ReceiptSuccess {...defaultProps} documentId="doc-uuid-123" />);

    expect(screen.getByText("Invia ricevuta")).toBeInTheDocument();
  });

  it("hides share button when documentId is not provided", () => {
    render(<ReceiptSuccess {...defaultProps} />);

    expect(screen.queryByText("Invia ricevuta")).not.toBeInTheDocument();
  });

  it("calls onNewReceipt when 'Nuovo scontrino' is clicked", () => {
    const onNewReceipt = vi.fn();
    render(<ReceiptSuccess {...defaultProps} onNewReceipt={onNewReceipt} />);

    fireEvent.click(screen.getByText("Nuovo scontrino"));

    expect(onNewReceipt).toHaveBeenCalled();
  });

  it("copies URL to clipboard and shows 'Link copiato!' feedback", async () => {
    render(<ReceiptSuccess {...defaultProps} documentId="doc-uuid-123" />);

    await act(async () => {
      fireEvent.click(screen.getByText("Invia ricevuta"));
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining("/r/doc-uuid-123"),
    );
    expect(screen.getByText("Link copiato!")).toBeInTheDocument();
  });

  it("resets 'Link copiato!' back to share button after 2 seconds (useEffect cleanup)", async () => {
    render(<ReceiptSuccess {...defaultProps} documentId="doc-uuid-123" />);

    await act(async () => {
      fireEvent.click(screen.getByText("Invia ricevuta"));
    });

    expect(screen.getByText("Link copiato!")).toBeInTheDocument();

    // Advance timer — the useEffect cleanup fires setTimeout
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Link copiato!")).not.toBeInTheDocument();
    expect(screen.getByText("Invia ricevuta")).toBeInTheDocument();
  });

  it("uses navigator.share when available", async () => {
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });
    mockShare.mockResolvedValue(undefined);

    render(<ReceiptSuccess {...defaultProps} documentId="doc-uuid-123" />);

    await act(async () => {
      fireEvent.click(screen.getByText("Invia ricevuta"));
    });

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("/r/doc-uuid-123"),
      }),
    );
    // Clipboard should NOT be called when share succeeds
    expect(mockWriteText).not.toHaveBeenCalled();
  });
});
