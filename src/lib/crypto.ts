import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const TAG_LENGTH = 16; // 128 bits
const VERSION_LENGTH = 1;
const KEY_LENGTH = 32; // 256 bits

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * Output format (base64): [1B version][12B IV][16B authTag][NB ciphertext]
 *
 * @param plaintext - The string to encrypt
 * @param key - 32-byte encryption key
 * @param keyVersion - Key version identifier (1-255), default 1
 * @returns Base64-encoded encrypted string
 */
export function encrypt(
  plaintext: string,
  key: Buffer,
  keyVersion: number = 1,
): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes`);
  }
  if (keyVersion < 1 || keyVersion > 255) {
    throw new Error("Key version must be 1-255");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const packed = Buffer.concat([
    Buffer.from([keyVersion]),
    iv,
    authTag,
    encrypted,
  ]);

  return packed.toString("base64");
}

/**
 * Decrypt a ciphertext produced by encrypt().
 *
 * @param encrypted - Base64-encoded encrypted string
 * @param keys - Map of key version to 32-byte key Buffer
 * @returns The original plaintext
 */
export function decrypt(encrypted: string, keys: Map<number, Buffer>): string {
  const packed = Buffer.from(encrypted, "base64");
  const minLength = VERSION_LENGTH + IV_LENGTH + TAG_LENGTH + 1;

  if (packed.length < minLength) {
    throw new Error("Invalid encrypted data: too short");
  }

  const version = packed[0];
  const iv = packed.subarray(VERSION_LENGTH, VERSION_LENGTH + IV_LENGTH);
  const authTag = packed.subarray(
    VERSION_LENGTH + IV_LENGTH,
    VERSION_LENGTH + IV_LENGTH + TAG_LENGTH,
  );
  const ciphertext = packed.subarray(VERSION_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = keys.get(version);
  if (!key) {
    throw new Error(`Unknown key version: ${version}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Generate a random 256-bit encryption key.
 *
 * @returns 32-byte key as hex string (64 characters)
 */
export function generateKey(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}

/**
 * Parse a 64-character hex key from an env var, con messaggio che nomina la
 * variabile: un errore generico su una config a due chiavi (corrente +
 * precedente) non dice quale delle due è rotta.
 */
function parseKeyHex(hex: string, envName: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${envName} must be a 64-character hex string`);
  }
  return Buffer.from(hex, "hex");
}

/** Parse a key version (intero in [1, 255]) da un env var nominata. */
function parseKeyVersion(raw: string, envName: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `${envName} must be a positive integer (1-255), got: ${raw}`,
    );
  }

  const version = Number.parseInt(raw, 10);
  if (!Number.isInteger(version) || version < 1 || version > 255) {
    throw new Error(
      `${envName} must be an integer in range [1, 255], got: ${raw}`,
    );
  }
  return version;
}

/**
 * Load the active encryption key from the ENCRYPTION_KEY environment variable.
 *
 * @throws If the variable is missing or not a 64-character hex string.
 */
export function getEncryptionKey(): Buffer {
  return parseKeyHex(process.env.ENCRYPTION_KEY ?? "", "ENCRYPTION_KEY");
}

/**
 * Return the current key version from ENCRYPTION_KEY_VERSION (default: 1).
 *
 * Validazione strict: deve essere un intero in [1, 255]. Valori sporchi
 * (`NaN`, `0`, `-1`, `999`, `"abc"`, `"1.5"`) producono fail-fast con messaggio
 * esplicito, evitando di propagare configurazioni invalide fino al primo
 * `encrypt()` (che fallirebbe a runtime con stato applicativo incoerente).
 */
export function getKeyVersion(): number {
  const raw = process.env.ENCRYPTION_KEY_VERSION;
  if (raw === undefined || raw === "") return 1;
  return parseKeyVersion(raw, "ENCRYPTION_KEY_VERSION");
}

/**
 * Legge la chiave PRECEDENTE opzionale (`ENCRYPTION_KEY_PREVIOUS` +
 * `ENCRYPTION_KEY_PREVIOUS_VERSION`), presente solo durante una rotazione.
 *
 * Entrambe assenti o vuote (regola 18: un env "present-but-empty" non è un
 * default) → `null`, nessuna chiave aggiuntiva. Metà configurazione → throw:
 * silenziosamente ignorarla renderebbe illeggibili le righe non ancora
 * ri-cifrate, cioè esattamente il bug che questa funzione esiste per evitare.
 */
function readPreviousKey(): { version: number; key: Buffer } | null {
  const hex = process.env.ENCRYPTION_KEY_PREVIOUS;
  const rawVersion = process.env.ENCRYPTION_KEY_PREVIOUS_VERSION;
  const hasKey = hex !== undefined && hex !== "";
  const hasVersion = rawVersion !== undefined && rawVersion !== "";

  if (!hasKey && !hasVersion) return null;
  if (!hasVersion) {
    throw new Error(
      "ENCRYPTION_KEY_PREVIOUS_VERSION must be set alongside ENCRYPTION_KEY_PREVIOUS",
    );
  }
  if (!hasKey) {
    throw new Error(
      "ENCRYPTION_KEY_PREVIOUS must be set alongside ENCRYPTION_KEY_PREVIOUS_VERSION",
    );
  }

  return {
    version: parseKeyVersion(rawVersion, "ENCRYPTION_KEY_PREVIOUS_VERSION"),
    key: parseKeyHex(hex, "ENCRYPTION_KEY_PREVIOUS"),
  };
}

/**
 * Key map da passare a `decrypt()`: la chiave corrente più, durante una
 * rotazione, quella precedente.
 *
 * Perché esiste (REVIEW #17): i caller costruivano
 * `new Map([[row.keyVersion, getEncryptionKey()]])`, cioè mappavano la versione
 * MEMORIZZATA sulla chiave CORRENTE. A cavallo di una rotazione quella mappa
 * mente — decifra un payload v1 con la chiave v2 → authTag mismatch — e la
 * rotazione richiedeva quindi una finestra di downtime fra la ri-cifratura
 * delle righe e il deploy della nuova env. Qui ogni versione è mappata sulla
 * chiave che l'ha davvero prodotta, e una versione senza chiave in env
 * fallisce esplicita in `decrypt()` ("Unknown key version") invece di
 * produrre garbage.
 *
 * Runbook di rotazione zero-downtime:
 *
 *  1. Deploy con ENTRAMBE le chiavi in env: la nuova come `ENCRYPTION_KEY` +
 *     `ENCRYPTION_KEY_VERSION`, la vecchia come `ENCRYPTION_KEY_PREVIOUS` +
 *     `ENCRYPTION_KEY_PREVIOUS_VERSION`. Le righe ancora alla versione vecchia
 *     restano leggibili; le nuove scritture nascono già alla versione nuova.
 *  2. `npx tsx scripts/rotate-encryption-key.ts` per ri-cifrare le righe
 *     rimaste alla versione precedente (idempotente, ri-eseguibile).
 *  3. Rimuovere `ENCRYPTION_KEY_PREVIOUS*` dall'env e ri-deployare.
 *
 * @throws Se la chiave corrente manca/è malformata, se la coppia precedente è
 * configurata a metà, o se la precedente collide con la corrente (stessa
 * versione o stessa chiave: entrambe rendono la rotazione una no-op silenziosa).
 */
export function getEncryptionKeys(): Map<number, Buffer> {
  const currentVersion = getKeyVersion();
  const currentKey = getEncryptionKey();
  const keys = new Map<number, Buffer>([[currentVersion, currentKey]]);

  const previous = readPreviousKey();
  if (!previous) return keys;

  if (previous.version === currentVersion) {
    throw new Error(
      `ENCRYPTION_KEY_PREVIOUS_VERSION and ENCRYPTION_KEY_VERSION are set to the same version (${currentVersion}): the previous key would shadow the current one`,
    );
  }
  if (previous.key.equals(currentKey)) {
    throw new Error(
      "ENCRYPTION_KEY_PREVIOUS is the same key as ENCRYPTION_KEY: a rotation needs a distinct previous key",
    );
  }

  keys.set(previous.version, previous.key);
  return keys;
}

/**
 * KEY ROTATION
 *
 * I caller di `decrypt()` devono costruire la key map con
 * `getEncryptionKeys()`, MAI con `new Map([[row.keyVersion, getEncryptionKey()]])`:
 * quest'ultima etichetta la chiave corrente con la versione memorizzata e
 * mente a cavallo di una rotazione (REVIEW #17).
 *
 * `encrypt()` invece usa sempre e solo la chiave corrente,
 * `encrypt(plaintext, getEncryptionKey(), getKeyVersion())`: si decifra da N
 * versioni, si cifra su una sola.
 *
 * Runbook completo nella doc di `getEncryptionKeys()` sopra e nell'header di
 * `scripts/rotate-encryption-key.ts`.
 */
