import { z } from "zod/v4";
import { refineGlobalDiscount } from "@/lib/receipts/global-discount-schema";
import { refineLotteryCode } from "@/lib/receipts/lottery-code-schema";

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
  vatCode: z.enum(["4", "5", "10", "22", "N1", "N2", "N3", "N4", "N5", "N6"]),
});

/** Numero minimo/massimo di righe per scontrino, condiviso tra i consumer. */
export const SALE_LINES_MIN = 1;
export const SALE_LINES_MAX = 100;

/** Field schema riusabili dal corpo SALE. */
export const paymentMethodSchema = z.enum(["PC", "PE"]);
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
    lines: ReadonlyArray<{ grossUnitPrice: number; quantity: number }>;
    paymentMethod: "PC" | "PE";
    lotteryCode?: string | null;
    globalDiscount?: number;
  },
  ctx: z.RefinementCtx,
): void {
  refineLotteryCode(data, ctx);
  refineGlobalDiscount(data, ctx);
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
    paymentMethod: paymentMethodSchema,
    idempotencyKey: idempotencyKeySchema,
    lotteryCode: lotteryCodeSchema,
    globalDiscount: globalDiscountSchema,
  })
  .superRefine(refineSaleBody);
