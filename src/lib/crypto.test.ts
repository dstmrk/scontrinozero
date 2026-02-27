/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import {
  encrypt,
  decrypt,
  generateKey,
  getEncryptionKey,
  getKeyVersion,
} from "./crypto";

function makeKey(): Buffer {
  return randomBytes(32);
}

function makeKeyMap(key: Buffer, version = 1): Map<number, Buffer> {
  return new Map([[version, key]]);
}

describe("crypto (AES-256-GCM)", () => {
  it("encrypt then decrypt returns the original plaintext", () => {
    const key = makeKey();
    const plaintext = "hello world";

    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, makeKeyMap(key));

    expect(decrypted).toBe(plaintext);
  });

  it("handles Unicode plaintext correctly", () => {
    const key = makeKey();
    const plaintext = "Caffè €10,00 — scontrino #42 🧾";

    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, makeKeyMap(key));

    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext", () => {
    const key = makeKey();
    const plaintext = "same input";

    const encrypted1 = encrypt(plaintext, key);
    const encrypted2 = encrypt(plaintext, key);

    expect(encrypted1).not.toBe(encrypted2);
  });

  it("throws on tampered ciphertext", () => {
    const key = makeKey();
    const encrypted = encrypt("secret data", key);

    const buf = Buffer.from(encrypted, "base64");
    // Flip a byte in the ciphertext section (after version + IV + authTag = 29 bytes)
    buf[29] ^= 0xff;
    const tampered = buf.toString("base64");

    expect(() => decrypt(tampered, makeKeyMap(key))).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const key = makeKey();
    const encrypted = encrypt("secret data", key);

    const buf = Buffer.from(encrypted, "base64");
    // Auth tag starts at byte 13 (after version=1 + IV=12)
    buf[13] ^= 0xff;
    const tampered = buf.toString("base64");

    expect(() => decrypt(tampered, makeKeyMap(key))).toThrow();
  });

  it("throws on tampered IV", () => {
    const key = makeKey();
    const encrypted = encrypt("secret data", key);

    const buf = Buffer.from(encrypted, "base64");
    // IV starts at byte 1 (after version=1)
    buf[1] ^= 0xff;
    const tampered = buf.toString("base64");

    expect(() => decrypt(tampered, makeKeyMap(key))).toThrow();
  });

  it("throws when decrypting with the wrong key", () => {
    const key1 = makeKey();
    const key2 = makeKey();
    const encrypted = encrypt("secret data", key1);

    expect(() => decrypt(encrypted, makeKeyMap(key2))).toThrow();
  });

  it("decrypts data encrypted with different key versions", () => {
    const key1 = makeKey();
    const key2 = makeKey();

    const encrypted1 = encrypt("data v1", key1, 1);
    const encrypted2 = encrypt("data v2", key2, 2);

    const keys = new Map<number, Buffer>([
      [1, key1],
      [2, key2],
    ]);

    expect(decrypt(encrypted1, keys)).toBe("data v1");
    expect(decrypt(encrypted2, keys)).toBe("data v2");
  });
});

describe("generateKey", () => {
  it("returns a 64-character hex string (32 bytes)", () => {
    const key = generateKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("getEncryptionKey", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
  });

  it("returns a 32-byte Buffer from a valid 64-char hex ENCRYPTION_KEY", () => {
    process.env.ENCRYPTION_KEY = "ab".repeat(32);
    const key = getEncryptionKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => getEncryptionKey()).toThrow("ENCRYPTION_KEY");
  });

  it("throws when ENCRYPTION_KEY is not 64 chars", () => {
    process.env.ENCRYPTION_KEY = "abc123";
    expect(() => getEncryptionKey()).toThrow("ENCRYPTION_KEY");
  });
});

describe("getKeyVersion", () => {
  const originalVersion = process.env.ENCRYPTION_KEY_VERSION;

  afterEach(() => {
    if (originalVersion === undefined)
      delete process.env.ENCRYPTION_KEY_VERSION;
    else process.env.ENCRYPTION_KEY_VERSION = originalVersion;
  });

  it("returns 1 when ENCRYPTION_KEY_VERSION is not set", () => {
    delete process.env.ENCRYPTION_KEY_VERSION;
    expect(getKeyVersion()).toBe(1);
  });

  it("returns the configured version", () => {
    process.env.ENCRYPTION_KEY_VERSION = "3";
    expect(getKeyVersion()).toBe(3);
  });
});
