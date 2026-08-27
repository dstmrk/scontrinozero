import { z } from "zod/v4";
import { refineGlobalDiscount } from "@/lib/receipts/global-discount-schema";
import { refineLotteryCode } from "@/lib/receipts/lottery-code-schema";
import {
  sumPaymentCents,
  type PaymentInput,
} from "@/lib/receipts/payment-input";
import { calcInputLinesTotalCents } from "@/lib/receipts/receipt-totals";

/**
 * Schema di validazione condiviso per un documento commerciale di vendita (SALE).
 *
 * Fonte di verità **unica** dei limiti di precisione fiscale e dei vincoli del
 * corpo scontrino, consumata sia dalla server action `emitReceipt`
 * (`src/server/receipt-actions.ts`, canale cassa/UI) sia dalla Developer API
 * `POST /api/v1/receipts` (`src/app/api/v1/receipts/route.ts`). Prima esistevano
 * due copie quasi identiche: un bump di un `max()` (o un nuovo `vatCode`) su una
 * sola le faceva divergere silenziosamente. Stesso razionale per cui
 * `refineLotteryCode` era già stato estratto (`lottery-code-schema.ts`).
 *
 * Gli unici bit consumer-specifici NON vivono qui: la server action aggiunge
 * `id` (chiave React UI-only) sulla riga e `businessId` sul corpo; la route API
 * ricava il `businessId` dall'auth. La server action ricompone il proprio
 * oggetto riusando questi schema (vedi nota su `saleBodySchema`).
 */

/** Singola riga SALE — regole di precisione allineate alle colonne DB. */
export const saleLineSchema = z.object({
  description: z.string().min(1).max(200),
  // max 3 decimali — colonna DB numeric(10,3). parseFloat(toFixed(3)) === v:
  // roundtrip pulito via stringa, gestisce gli edge case IEEE-754.
  quantity: z
    .number()
    .positive()
    .max(9999)
    .refine((v) => Number.parseFloat(v.toFixed(3)) === v, "max 3 decimali"),
  // max 2 decimali — colonna DB numeric(10,2).
  grossUnitPrice: z
    .number()
    .nonnegative()
    .max(999_999.99)
    .refine((v) => Number.parseFloat(v.toFixed(2)) === v, "max 2 decimali"),
  // Sconto DELLA riga (non per unità), lordo — colonna DB numeric(10,2).
  // Il tetto rispetto al totale di riga non sta qui: dipende da altri due
  // campi dello stesso oggetto e vive in `refineSaleLineDiscount`.
  lineDiscount: z
    .number()
    .nonnegative()
    .max(999_999.99)
    .refine((v) => Number.parseFloat(v.toFixed(2)) === v, "max 2 decimali")
    .optional(),
  vatCode: z.enum(["4", "5", "10", "22", "N1", "N2", "N3", "N4", "N5", "N6"]),
});

/** Numero minimo/massimo di righe per scontrino, condiviso tra i consumer. */
export const SALE_LINES_MIN = 1;
export const SALE_LINES_MAX = 100;

/** Field schema riusabili dal corpo SALE. */
export const paymentMethodSchema = z.enum(["PC", "PE"]);

/**
 * Ripartizione dell'incassato fra più modalità (**pagamento misto**).
 *
 * Solo `PC` e `PE`: `TR` e le tre `NR_*` esistono nel tracciato AdE
 * (`HAR.md` voce #6) e il mapper le regge già, ma non sono mai state
 * osservate con importo > 0 (voce #15) — esporle vorrebbe dire chiedere
 * all'esercente un dato che non sappiamo trasmettere. `NR_EF` non è nemmeno
 * un importo: è un flag booleano mutuamente esclusivo con ogni altro
 * pagamento, e nel nostro modello non sarebbe un `PaymentRequest`.
 *
 * Il tetto di due voci non è arbitrario: è la cardinalità dell'enum, e due
 * voci dello stesso tipo sono rifiutate dal `superRefine` di corpo. I vincoli
 * che guardano il documento intero — quadratura, mutua esclusione con
 * `paymentMethod` — non stanno qui perché dipendono dalle righe.
 */
export const paymentsSchema = z
  .array(
    z.object({
      type: paymentMethodSchema,
      amount: z
        .number()
        .nonnegative()
        .max(999_999.99)
        .refine((v) => Number.parseFloat(v.toFixed(2)) === v, "max 2 decimali"),
    }),
  )
  .min(1)
  .max(2);
export const idempotencyKeySchema = z.string().uuid();
// Format-validated solo quando paymentMethod === "PE" — vedi refineLotteryCode.
export const lotteryCodeSchema = z.string().nullable().optional();
/**
 * Sconto a pagare (`scontoAbbuono` AdE, HAR.md voce #3b) in euro, 2 decimali.
 *
 * Assente = nessun abbuono. Il tetto rispetto al totale delle righe NON sta
 * qui — dipende dalle righe, quindi vive in `refineGlobalDiscount` a livello
 * di corpo. Il `max` è solo la guardia di dominio, allineata a
 * `grossUnitPrice`.
 */
export const globalDiscountSchema = z
  .number()
  .nonnegative()
  .max(999_999.99)
  .refine((v) => Number.parseFloat(v.toFixed(2)) === v, "max 2 decimali")
  .optional();

/**
 * Vincoli che guardano il corpo intero, non un campo solo: il codice lotteria
 * dipende dal metodo di pagamento, lo sconto a pagare dal totale delle righe.
 *
 * Stanno insieme in un solo `superRefine` perché Zod ne applica uno per
 * schema: incatenarne due significherebbe che il secondo non gira quando il
 * primo fallisce, e l'esercente vedrebbe un errore alla volta su un form che
 * li mostra entrambi.
 */
export function refineSaleBody(
  data: {
    lines: ReadonlyArray<{
      grossUnitPrice: number;
      quantity: number;
      lineDiscount?: number;
    }>;
    paymentMethod?: "PC" | "PE";
    payments?: readonly PaymentInput[];
    lotteryCode?: string | null;
    globalDiscount?: number;
  },
  ctx: z.RefinementCtx,
): void {
  refinePaymentDeclaration(data, ctx);
  refineLotteryCode(data, ctx);
  refineSaleLineDiscounts(data, ctx);
  refineGlobalDiscount(data, ctx);
}

/**
 * Come il documento dichiara il pagamento, e se quella dichiarazione quadra.
 *
 * **Esattamente uno** fra `paymentMethod` e `payments`. Accettarli insieme
 * vorrebbe dire ammettere due dichiarazioni dello stesso fatto che possono
 * contraddirsi, senza una regola sensata su chi vince; accettarne zero
 * lascerebbe un documento fiscale senza modalità di incasso.
 *
 * **La quadratura è responsabilità nostra.** `HAR.md` voce #5 fissa
 * l'invariante `Σ importi + scontoAbbuono = ammontareComplessivo`, ma la voce
 * #15 avverte che non abbiamo mai inviato un payload sbilanciato e **non
 * sappiamo se l'AdE lo rifiuti**. Non c'è quindi una rete a valle: un
 * documento storto passerebbe e resterebbe registrato tale, in modo
 * irreversibile.
 *
 * Confronto in **centesimi interi** (regola 17) via `calcInputLinesTotalCents`,
 * la stessa aritmetica del totale trasmesso ad AdE: su euro float tre righe da
 * `0,10` sommano a `0.30000000000000004` e una ripartizione perfettamente
 * quadrata verrebbe rifiutata.
 *
 * Con il solo `paymentMethod` non si verifica nulla: la quadratura è
 * soddisfatta per costruzione, perché il service versa `totale − abbuono`
 * nell'unico slot.
 */
function refinePaymentDeclaration(
  data: {
    lines: ReadonlyArray<{
      grossUnitPrice: number;
      quantity: number;
      lineDiscount?: number;
    }>;
    paymentMethod?: "PC" | "PE";
    payments?: readonly PaymentInput[];
    globalDiscount?: number;
  },
  ctx: z.RefinementCtx,
): void {
  const { paymentMethod, payments } = data;

  if (paymentMethod && payments) {
    ctx.addIssue({
      code: "custom",
      path: ["payments"],
      message:
        "Indica il metodo di pagamento oppure la ripartizione, non entrambi.",
    });
    return;
  }

  if (!paymentMethod && !payments) {
    ctx.addIssue({
      code: "custom",
      path: ["paymentMethod"],
      message: "Indica il metodo di pagamento o la ripartizione degli importi.",
    });
    return;
  }

  if (!payments) return;

  const types = payments.map((p) => p.type);
  if (new Set(types).size !== types.length) {
    ctx.addIssue({
      code: "custom",
      path: ["payments"],
      message:
        "Ogni modalità di pagamento può comparire una sola volta nella ripartizione.",
    });
    return;
  }

  const paidCents = sumPaymentCents(payments);
  if (paidCents === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["payments"],
      message: "La ripartizione deve incassare almeno un centesimo.",
    });
    return;
  }

  const discountCents = Math.round((data.globalDiscount ?? 0) * 100);
  const linesTotalCents = calcInputLinesTotalCents(data.lines);
  if (paidCents + discountCents !== linesTotalCents) {
    ctx.addIssue({
      code: "custom",
      path: ["payments"],
      message:
        "La somma dei pagamenti e dello sconto a pagare deve fare il totale dello scontrino.",
    });
  }
}

/**
 * Ogni sconto di riga deve stare dentro il totale lordo della sua riga.
 *
 * Vive qui e non su `saleLineSchema` perché guarda tre campi insieme
 * (`grossUnitPrice`, `quantity`, `lineDiscount`), e perché il messaggio può
 * dire QUALE riga è sbagliata — su un carrello di venti voci è la differenza
 * fra un errore azionabile e uno da indovinare.
 *
 * Confronto in centesimi interi (regola 17): sui lordi float una riga da
 * `0.1 × 3` scontata di `0.30` verrebbe rifiutata per drift.
 *
 * Sconto **pari** al totale di riga è ammesso — è una riga a prezzo zero, che
 * l'AdE accetta (`totale` `0.00000000`, oracolo in `mapper.test.ts`) e che
 * resta distinta da un omaggio, il quale non concorre affatto al totale del
 * documento (`HAR.md` voce #7) e non è ancora supportato.
 */
function refineSaleLineDiscounts(
  data: {
    lines: ReadonlyArray<{
      grossUnitPrice: number;
      quantity: number;
      lineDiscount?: number;
    }>;
  },
  ctx: z.RefinementCtx,
): void {
  data.lines.forEach((line, index) => {
    const discount = line.lineDiscount ?? 0;
    if (discount === 0) return;

    const lineGrossCents = Math.round(
      line.grossUnitPrice * line.quantity * 100,
    );
    if (Math.round(discount * 100) > lineGrossCents) {
      ctx.addIssue({
        code: "custom",
        path: ["lines", index, "lineDiscount"],
        message: `Lo sconto della riga ${index + 1} supera il totale della riga.`,
      });
    }
  });
}

/**
 * Corpo SALE usato **direttamente** da `POST /api/v1/receipts`.
 *
 * È un `ZodEffects` (per via di `.superRefine`) → **non** estendibile con
 * `.extend`. La server action non lo estende: ricompone il proprio oggetto
 * riusando `saleLineSchema.extend({ id })` + i field schema esportati sopra.
 */
export const saleBodySchema = z
  .object({
    lines: z.array(saleLineSchema).min(SALE_LINES_MIN).max(SALE_LINES_MAX),
    // Opzionale perché mutuamente esclusivo con `payments` — esattamente uno
    // dei due, imposto da `refinePaymentDeclaration`. Un corpo con
    // `paymentMethod` resta valido com'è sempre stato: nessun breaking change
    // su `/api/v1` (REVIEW.md #87).
    paymentMethod: paymentMethodSchema.optional(),
    payments: paymentsSchema.optional(),
    idempotencyKey: idempotencyKeySchema,
    lotteryCode: lotteryCodeSchema,
    globalDiscount: globalDiscountSchema,
  })
  .superRefine(refineSaleBody);
