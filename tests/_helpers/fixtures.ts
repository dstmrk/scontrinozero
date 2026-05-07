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
/** UUID per un secondo entity (typically: idempotencyKey, related document). */
export const TEST_RELATED_ID = "660e8400-e29b-41d4-a716-446655440001";
/** UUID stabile per usi come idempotencyKey nei test (alias del precedente). */
export const TEST_IDEMPOTENCY_KEY = TEST_RELATED_ID;
/** UUID non valido per testare il path 404/400 di route che validano UUID. */
export const INVALID_UUID = "not-a-valid-uuid";
