/**
 * Zod validation schemas for public API requests.
 *
 * Reference: docs/api-spec.md sez. 10
 */

import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** ISO 8601 date pattern (yyyy-MM-dd) */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Valid AdE vatCode values (sez. 6) */
const vatCodeSchema = z.enum([
  "4",
  "5",
  "10",
  "22",
  "N1",
  "N2",
  "N3",
  "N4",
  "N5",
  "N6",
  "2",
  "6.4",
  "7",
  "7.3",
  "7.5",
  "7.65",
  "7.95",
  "8.3",
  "8.5",
  "8.8",
  "9.5",
  "12.3",
]);

/** Valid public payment types (sez. 9.5) */
const paymentTypeSchema = z.enum([
  "CASH",
  "ELECTRONIC",
  "MEAL_VOUCHER",
  "NOT_COLLECTED_INVOICE",
  "NOT_COLLECTED_SERVICE",
  "NOT_COLLECTED_CREDIT",
]);

// ---------------------------------------------------------------------------
// Sale line
// ---------------------------------------------------------------------------

const saleLineSchema = z.object({
  description: z.string().min(1).max(1000),
  quantity: z.number().positive(),
  unitPriceGross: z.number().nonnegative(),
  unitDiscount: z.number().nonnegative(),
  vatCode: vatCodeSchema,
  isGift: z.boolean(),
});

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  type: paymentTypeSchema,
  amount: z.number().nonnegative(),
  count: z.number().int().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// Sale request (sez. 8.1, 10)
// ---------------------------------------------------------------------------

export const saleRequestSchema = z.object({
  idempotencyKey: z.uuid(),
  document: z.object({
    date: isoDateSchema,
    customerTaxCode: z.string().nullable(),
    isGiftDocument: z.boolean(),
    lines: z.array(saleLineSchema).min(1),
    payments: z.array(paymentSchema).min(1),
    globalDiscount: z.number().nonnegative(),
    deductibleAmount: z.number().nonnegative(),
  }),
});

export type ValidatedSaleRequest = z.infer<typeof saleRequestSchema>;

// ---------------------------------------------------------------------------
// Void request (sez. 8.2, 10)
// ---------------------------------------------------------------------------

export const voidRequestSchema = z.object({
  idempotencyKey: z.uuid(),
  originalDocument: z.object({
    transactionId: z.string().min(1),
    documentProgressive: z.string().min(1),
    date: isoDateSchema,
  }),
});

export type ValidatedVoidRequest = z.infer<typeof voidRequestSchema>;
