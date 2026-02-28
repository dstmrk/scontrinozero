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
 * Load the active encryption key from the ENCRYPTION_KEY environment variable.
 *
 * @throws If the variable is missing or not a 64-character hex string.
 */
export function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex?.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Return the current key version from ENCRYPTION_KEY_VERSION (default: 1).
 */
export function getKeyVersion(): number {
  return Number.parseInt(process.env.ENCRYPTION_KEY_VERSION || "1", 10);
}

/**
 * KEY ROTATION WARNING
 *
 * The callers of decrypt() build the key map as:
 *   new Map([[cred.keyVersion, getEncryptionKey()]])
 *
 * This means they always map the stored keyVersion to the CURRENT key.
 * If you rotate (new ENCRYPTION_KEY + new ENCRYPTION_KEY_VERSION), old
 * credentials encrypted with the previous key will fail to decrypt.
 *
 * Before rotating keys you MUST re-encrypt all ade_credentials rows
 * with the new key first, THEN deploy the updated env vars.
 *
 * Future improvement: support multiple active keys via env vars so that
 * zero-downtime rotation is possible without a re-encryption migration.
 */
