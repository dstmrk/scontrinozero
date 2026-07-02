/**
 * UUID v4 fissi per fixture cross-test.
 *
 * Devono restare stabili: cambiarli farebbe divergere il significato di una
 * UUID tra file diversi. Aggiungere nuovi UUID con un suffisso incrementale
 * (`...440004`, `...440005`, …) anziché riusare quelli esistenti per altri
 * scopi.
 */

/** UUID di un Business di test. */
export const TEST_BUSINESS_ID = "550e8400-e29b-41d4-a716-446655440000";
/** Secondo UUID di Business di test (quando serve distinguerlo da altri id). */
export const TEST_BUSINESS_ID_2 = "550e8400-e29b-41d4-a716-446655440002";
/** UUID stabile per usi come idempotencyKey nei test. */
export const TEST_IDEMPOTENCY_KEY = "660e8400-e29b-41d4-a716-446655440001";
/** UUID non valido per testare il path 404/400 di route che validano UUID. */
export const INVALID_UUID = "not-a-valid-uuid";
