import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrintableReceipt } from "./types";

const mockPrintBytes = vi.fn();
const mockGetPrinterSnapshot = vi.fn();
const mockReadPrinterPreferences = vi.fn();
const mockBuildReceiptCommands = vi.fn();
const mockBuildTestPrintCommands = vi.fn();

vi.mock("./bluetooth-printer", () => ({
  printBytes: (...args: unknown[]) => mockPrintBytes(...args),
  getPrinterSnapshot: () => mockGetPrinterSnapshot(),
}));
vi.mock("./printer-preferences", () => ({
  readPrinterPreferences: () => mockReadPrinterPreferences(),
}));
vi.mock("./receipt-escpos", () => ({
  buildReceiptCommands: (...args: unknown[]) =>
    mockBuildReceiptCommands(...args),
}));
vi.mock("./test-print", () => ({
  buildTestPrintCommands: (...args: unknown[]) =>
    mockBuildTestPrintCommands(...args),
}));

const { printReceipt, printTestPage } = await import("./print-receipt");

const receipt = { kind: "sale" } as unknown as PrintableReceipt;
const bytes = new Uint8Array([1, 2, 3]);

describe("print-receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPrinterSnapshot.mockReturnValue({
      status: "connected",
      deviceName: "MTP-II",
      language: "star-prnt",
      codepageMapping: "star",
    });
    mockReadPrinterPreferences.mockReturnValue({
      autoPrint: true,
      paperWidth: "80",
      printQr: false,
    });
    mockBuildReceiptCommands.mockReturnValue(bytes);
    mockBuildTestPrintCommands.mockReturnValue(bytes);
    mockPrintBytes.mockResolvedValue(undefined);
  });

  it("printReceipt combina profilo stampante e preferenze nelle opzioni di encoding", async () => {
    await printReceipt(receipt);

    expect(mockBuildReceiptCommands).toHaveBeenCalledWith(receipt, {
      columns: 48,
      printQr: false,
      language: "star-prnt",
      codepageMapping: "star",
    });
    expect(mockPrintBytes).toHaveBeenCalledWith(bytes);
  });

  it("legge le preferenze a ogni stampa, non una volta sola", async () => {
    await printReceipt(receipt);
    mockReadPrinterPreferences.mockReturnValue({
      autoPrint: true,
      paperWidth: "58",
      printQr: true,
    });
    await printReceipt(receipt);

    expect(mockBuildReceiptCommands).toHaveBeenLastCalledWith(
      receipt,
      expect.objectContaining({ columns: 32, printQr: true }),
    );
  });

  it("printTestPage stampa la pagina di prova con le stesse opzioni", async () => {
    await printTestPage();

    expect(mockBuildTestPrintCommands).toHaveBeenCalledWith({
      columns: 48,
      printQr: false,
      language: "star-prnt",
      codepageMapping: "star",
    });
    expect(mockPrintBytes).toHaveBeenCalledWith(bytes);
  });

  it("propaga l'errore del trasporto al chiamante", async () => {
    const failure = new Error("not-connected");
    mockPrintBytes.mockRejectedValue(failure);

    await expect(printReceipt(receipt)).rejects.toBe(failure);
  });
});
