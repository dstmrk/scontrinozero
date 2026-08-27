import { describe, it, expect } from "vitest";
import { v1Payments } from "@/lib/receipts/v1-payments";

describe("v1Payments", () => {
  it("rende gli importi come stringhe a 2 decimali, non come numeri", () => {
    // Come `total` e `globalDiscount` nella stessa response: un numero JSON
    // costringerebbe il consumer a fidarsi del float, e sugli importi fiscali
    // quella è la fiducia sbagliata.
    expect(
      v1Payments([
        { type: "PC", amountCents: 50 },
        { type: "PE", amountCents: 100 },
      ]),
    ).toEqual([
      { type: "PC", amount: "0.50" },
      { type: "PE", amount: "1.00" },
    ]);
  });

  it("ritorna null — non un array vuoto — quando non c'è ripartizione", () => {
    // `[]` direbbe "nessun pagamento", falso su uno scontrino incassato con un
    // metodo solo. `null` dice "questo documento non ha un misto, leggi
    // paymentMethod".
    expect(v1Payments(null)).toBeNull();
  });

  it("non perde i centesimi sugli importi che in float non sono esatti", () => {
    expect(v1Payments([{ type: "PC", amountCents: 1234 }])).toEqual([
      { type: "PC", amount: "12.34" },
    ]);
  });
});
