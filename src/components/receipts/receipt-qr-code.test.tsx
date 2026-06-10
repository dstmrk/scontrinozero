import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReceiptQrCode } from "./receipt-qr-code";

describe("ReceiptQrCode", () => {
  const url = "https://scontrinozero.it/r/doc-uuid-123";

  it("renders the receipt URL as readable text", () => {
    render(<ReceiptQrCode url={url} />);

    expect(screen.getByText(url)).toBeInTheDocument();
  });

  it("renders an SVG QR code encoding the URL", () => {
    const { container } = render(<ReceiptQrCode url={url} />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("shows the scan instruction", () => {
    render(<ReceiptQrCode url={url} />);

    expect(screen.getByText(/inquadra il qr code/i)).toBeInTheDocument();
  });
});
