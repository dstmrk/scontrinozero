import type { z } from "zod/v4";
import { calcInputLinesTotalCents } from "@/lib/receipts/receipt-totals";

/**
 * Validatore condizionale per `globalDiscount` — lo **sconto a pagare**
 * (`scontoAbbuono` nel tracciato AdE, HAR.md voce #3b).
 *
 * Non è uno sconto sul corrispettivo: il documento resta di importo pieno e
 * l'IVA si versa piena. È la quota che l'esercente rinuncia a incassare, e
 * l'unico vincolo che l'AdE impone è la quadratura dei pagamenti (voce #5):
 *
 * ```
 * Σ vendita[].importo + scontoAbbuono = ammontareComplessivo
 * ```
 *
 * Con un metodo di pagamento singolo la quadratura è soddisfatta per
 * costruzione — `receipt-service` versa `totale − abbuono` nell'unico slot —
 * quindi qui basta impedire che l'abbuono superi ciò che c'è da incassare.
 *
 * **Perché `<` e non `≤`.** Un abbuono pari al totale lascerebbe tutti e sei
 * gli slot di pagamento a zero: nessuna cattura HAR mostra quella forma
 * (voce #15), e la stessa voce avverte che non sappiamo se l'AdE validi la
 * quadratura lato server — quindi un payload mai visto potrebbe essere
 * accettato e registrato storto, in modo irreversibile. Si pretende almeno un
 * centesimo incassato finché non esiste una cattura che dimostri il contrario.
 *
 * Condiviso fra `POST /api/v1/receipts` e la server action `emitReceipt`,
 * come `refineLotteryCode`.
 */
export function refineGlobalDiscount(
  data: {
    lines: ReadonlyArray<{ grossUnitPrice: number; quantity: number }>;
    globalDiscount?: number;
  },
  ctx: z.RefinementCtx,
): void {
  const discount = data.globalDiscount;
  if (discount == null || discount === 0) return;

  // Confronto in centesimi interi (regola 17): sui lordi float la somma delle
  // righe drifta e rifiuterebbe abbuoni legittimi.
  const discountCents = Math.round(discount * 100);
  const linesTotalCents = calcInputLinesTotalCents(data.lines);

  if (discountCents >= linesTotalCents) {
    ctx.addIssue({
      code: "custom",
      path: ["globalDiscount"],
      message:
        "Lo sconto a pagare deve lasciare almeno un centesimo da incassare.",
    });
  }
}
