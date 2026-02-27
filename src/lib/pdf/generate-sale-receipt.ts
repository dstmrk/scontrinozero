import PDFDocument from "pdfkit";

export interface SaleReceiptLine {
  description: string;
  quantity: number;
  grossUnitPrice: number;
  vatCode: string;
}

export interface SaleReceiptPdfData {
  businessName: string;
  vatNumber: string;
  address: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  lines: SaleReceiptLine[];
  paymentMethod: "PC" | "PE";
  createdAt: Date;
  adeProgressive: string;
  adeTransactionId: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** 58mm in pt (1mm = 2.8346pt). Compatible with 58mm and 80mm thermal printers. */
const PAGE_WIDTH = 165;
const MARGIN = 6;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

const VAT_LABELS: Record<string, string> = {
  "4": "4%",
  "5": "5%",
  "10": "10%",
  "22": "22%",
  N1: "Esclusa",
  N2: "Non sogg.",
  N3: "Non imp.",
  N4: "Esente",
  N5: "Reg.marg.",
  N6: "Non IVA",
};

const PAYMENT_LABELS: Record<string, string> = {
  PC: "Pagamento contante",
  PE: "Pagamento elettronico",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

/** Returns the VAT amount for a gross line total given a vatCode. */
export function computeVatAmount(
  lineTotalGross: number,
  vatCode: string,
): number {
  const rate = parseFloat(vatCode);
  if (isNaN(rate) || rate === 0) return 0; // N1-N6 codes have no VAT
  return lineTotalGross - lineTotalGross / (1 + rate / 100);
}

/** Estimates the page height based on number of lines and VAT rates.
 *
 * Calibrated empirically: fixed overhead ≈ 140pt (header + title + separators +
 * totals section + payment + footer with date+progressive only), 18pt per line
 * item (covers multi-qty wrap), 12pt per unique VAT rate row, 10pt bottom padding.
 */
function estimateHeight(lines: SaleReceiptLine[]): number {
  const uniqueVatRates = new Set(lines.map((l) => l.vatCode)).size;
  return 110 + lines.length * 18 + uniqueVatRates * 12 + 8;
}

// ─── Generator ──────────────────────────────────────────────────────────────

export function generateSaleReceiptPdf(
  data: SaleReceiptPdfData,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const height = estimateHeight(data.lines);
    const buffers: Buffer[] = [];

    const doc = new PDFDocument({
      size: [PAGE_WIDTH, height],
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
    });

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    let y = MARGIN;

    // ── Separator: dashed line ─────────────────────────────────────────────
    const drawSeparator = () => {
      doc
        .moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .dash(1, { space: 2 })
        .stroke()
        .undash();
      y += 5;
    };

    // ── Generic text line ─────────────────────────────────────────────────
    const drawLine = (
      text: string,
      opts: {
        align?: "left" | "center" | "right";
        bold?: boolean;
        italic?: boolean;
        size?: number;
        x?: number;
        width?: number;
      } = {},
    ) => {
      const {
        align = "left",
        bold = false,
        italic = false,
        size = 7,
        x = MARGIN,
        width = CONTENT_WIDTH,
      } = opts;
      let font = "Helvetica";
      if (bold) font = "Helvetica-Bold";
      if (italic) font = "Helvetica-Oblique";
      doc.font(font).fontSize(size).text(text, x, y, { width, align });
      y = doc.y + 1;
    };

    // ─── HEADER ────────────────────────────────────────────────────────────
    drawLine(data.businessName, { align: "center", bold: true, size: 8 });

    const addressLine = [data.address, data.city, data.province, data.zipCode]
      .filter(Boolean)
      .join(" – ");
    if (addressLine) drawLine(addressLine, { align: "center", size: 6 });
    drawLine(`P.IVA: ${data.vatNumber}`, { align: "center", size: 6 });
    y += 2;
    drawSeparator();

    // ─── TITLE ─────────────────────────────────────────────────────────────
    drawLine("DOCUMENTO COMMERCIALE", {
      align: "center",
      bold: true,
      size: 7,
    });
    drawLine("di vendita o prestazione", {
      align: "center",
      bold: true,
      size: 6,
    });
    y += 2;
    drawSeparator();

    // ─── LINE ITEMS ────────────────────────────────────────────────────────
    // Column widths (sum = CONTENT_WIDTH = 153pt):
    //   Description: 95pt (~62%), VAT: 22pt (~14%), Price: 36pt (~24%)
    const COL_DESC = Math.round(CONTENT_WIDTH * 0.62);
    const COL_VAT = Math.round(CONTENT_WIDTH * 0.14);
    const COL_PRICE = CONTENT_WIDTH - COL_DESC - COL_VAT;

    // Header row
    doc.font("Helvetica").fontSize(6);
    doc.text("Descrizione", MARGIN, y, { width: COL_DESC, align: "left" });
    doc.text("IVA", MARGIN + COL_DESC, y, { width: COL_VAT, align: "center" });
    doc.text("€", MARGIN + COL_DESC + COL_VAT, y, {
      width: COL_PRICE,
      align: "right",
    });
    y = doc.y + 2;

    let grandTotal = 0;
    const vatByCode: Map<string, number> = new Map();

    for (const line of data.lines) {
      const qty = line.quantity;
      const price = line.grossUnitPrice;
      const lineTotal = qty * price;
      grandTotal += lineTotal;

      // Accumulate VAT by code
      const existingVat = vatByCode.get(line.vatCode) ?? 0;
      vatByCode.set(
        line.vatCode,
        existingVat + computeVatAmount(lineTotal, line.vatCode),
      );

      const vatLabel = VAT_LABELS[line.vatCode] ?? line.vatCode;
      const priceDisplay = formatPrice(lineTotal);

      // For quantities > 1: show "n.Q × unit_price"
      const hasMultipleQty = qty !== 1;
      const descDisplay = hasMultipleQty
        ? `${line.description}\nn.${qty % 1 === 0 ? Math.round(qty) : qty} × ${formatPrice(price)}`
        : line.description;

      const rowStartY = y;
      doc.font("Helvetica").fontSize(6.5);
      doc.text(descDisplay, MARGIN, rowStartY, {
        width: COL_DESC,
        align: "left",
      });
      const afterDescY = doc.y;

      doc.text(vatLabel, MARGIN + COL_DESC, rowStartY, {
        width: COL_VAT,
        align: "center",
      });
      doc.text(priceDisplay, MARGIN + COL_DESC + COL_VAT, rowStartY, {
        width: COL_PRICE,
        align: "right",
      });

      y = Math.max(afterDescY, rowStartY + 10) + 2;
    }

    drawSeparator();

    // ─── TOTALS ────────────────────────────────────────────────────────────
    const LABEL_W = CONTENT_WIDTH - 38;
    const AMT_W = 38;
    const AMT_X = MARGIN + LABEL_W;

    // Subtotale
    doc.font("Helvetica").fontSize(7);
    doc.text("Subtotale", MARGIN, y, { width: LABEL_W, align: "left" });
    doc.text(formatPrice(grandTotal), AMT_X, y, {
      width: AMT_W,
      align: "right",
    });
    y = doc.y + 1;

    // VAT breakdown: one row per rate that has a non-zero VAT amount
    doc.font("Helvetica").fontSize(6.5);
    for (const [code, vatAmount] of vatByCode.entries()) {
      if (vatAmount > 0.005) {
        const label = `di cui IVA ${VAT_LABELS[code] ?? code}`;
        doc.text(label, MARGIN, y, { width: LABEL_W, align: "left" });
        doc.text(formatPrice(vatAmount), AMT_X, y, {
          width: AMT_W,
          align: "right",
        });
        y = doc.y + 1;
      }
    }

    // TOTALE COMPLESSIVO
    doc.font("Helvetica-Bold").fontSize(8);
    doc.text("TOTALE COMPLESSIVO", MARGIN, y, {
      width: LABEL_W,
      align: "left",
    });
    doc.text(formatPrice(grandTotal), AMT_X, y, {
      width: AMT_W,
      align: "right",
    });
    y = doc.y + 1;
    drawSeparator();

    // ─── PAYMENT ───────────────────────────────────────────────────────────
    const paymentLabel =
      PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod;
    doc.font("Helvetica").fontSize(7);
    doc.text(paymentLabel, MARGIN, y, { width: LABEL_W, align: "left" });
    doc.text(formatPrice(grandTotal), AMT_X, y, {
      width: AMT_W,
      align: "right",
    });
    y = doc.y + 1;
    drawSeparator();

    // ─── FOOTER ────────────────────────────────────────────────────────────
    drawLine(formatDate(data.createdAt), { size: 7 });
    drawLine(`DOCUMENTO N. ${data.adeProgressive}`, { size: 7 });

    doc.end();
  });
}
