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
  getEncryptionKeys,
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

  // Byte offset del campo manomesso nel payload base64:
  // - ciphertext: dopo version + IV + authTag = 29 bytes
  // - auth tag: inizia a byte 13 (dopo version=1 + IV=12)
  // - IV: inizia a byte 1 (dopo version=1)
  it.each([
    ["ciphertext", 29],
    ["auth tag", 13],
    ["IV", 1],
  ])("throws on tampered %s", (_field, byteIndex) => {
    const key = makeKey();
    const encrypted = encrypt("secret data", key);

    const buf = Buffer.from(encrypted, "base64");
    buf[byteIndex] ^= 0xff;
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
    expect(key).toHaveLength(32);
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => getEncryptionKey()).toThrow("ENCRYPTION_KEY");
  });

  it("throws when ENCRYPTION_KEY is not 64 chars", () => {
    process.env.ENCRYPTION_KEY = "abc123";
    expect(() => getEncryptionKey()).toThrow("ENCRYPTION_KEY");
  });

  it("throws when ENCRYPTION_KEY is 64 chars but not hex", () => {
    // Prima del fix passava la sola check di lunghezza: `Buffer.from(hex, "hex")`
    // troncava silenziosamente al primo carattere non-hex → chiave corta.
    process.env.ENCRYPTION_KEY = "z".repeat(64);
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

  it("returns 1 when ENCRYPTION_KEY_VERSION is empty string", () => {
    process.env.ENCRYPTION_KEY_VERSION = "";
    expect(getKeyVersion()).toBe(1);
  });

  it("returns the configured version", () => {
    process.env.ENCRYPTION_KEY_VERSION = "3";
    expect(getKeyVersion()).toBe(3);
  });

  it("accepts boundary values 1 and 255", () => {
    process.env.ENCRYPTION_KEY_VERSION = "1";
    expect(getKeyVersion()).toBe(1);
    process.env.ENCRYPTION_KEY_VERSION = "255";
    expect(getKeyVersion()).toBe(255);
  });

  it.each(["0", "-1", "256", "999"])(
    "throws on out-of-range value %s",
    (val) => {
      process.env.ENCRYPTION_KEY_VERSION = val;
      expect(() => getKeyVersion()).toThrow(/ENCRYPTION_KEY_VERSION/);
    },
  );

  it.each(["abc", "1.5", "1e2", " 1 ", "0x1", "+1", "--1"])(
    "throws on non-integer value %s",
    (val) => {
      process.env.ENCRYPTION_KEY_VERSION = val;
      expect(() => getKeyVersion()).toThrow(/ENCRYPTION_KEY_VERSION/);
    },
  );
});

describe("getEncryptionKeys", () => {
  const KEY_ENVS = [
    "ENCRYPTION_KEY",
    "ENCRYPTION_KEY_VERSION",
    "ENCRYPTION_KEY_PREVIOUS",
    "ENCRYPTION_KEY_PREVIOUS_VERSION",
  ] as const;
  const original = new Map(KEY_ENVS.map((name) => [name, process.env[name]]));

  const CURRENT_HEX = "ab".repeat(32);
  const PREVIOUS_HEX = "cd".repeat(32);

  afterEach(() => {
    for (const name of KEY_ENVS) {
      const value = original.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function setCurrent(hex = CURRENT_HEX, version = "2") {
    process.env.ENCRYPTION_KEY = hex;
    process.env.ENCRYPTION_KEY_VERSION = version;
  }

  function setPrevious(hex = PREVIOUS_HEX, version = "1") {
    process.env.ENCRYPTION_KEY_PREVIOUS = hex;
    process.env.ENCRYPTION_KEY_PREVIOUS_VERSION = version;
  }

  function clearPrevious() {
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    delete process.env.ENCRYPTION_KEY_PREVIOUS_VERSION;
  }

  it("returns only the current key when no previous key is configured", () => {
    setCurrent(CURRENT_HEX, "2");
    clearPrevious();

    const keys = getEncryptionKeys();

    expect([...keys.keys()]).toEqual([2]);
    expect(keys.get(2)?.toString("hex")).toBe(CURRENT_HEX);
  });

  it("defaults the current version to 1 when ENCRYPTION_KEY_VERSION is unset", () => {
    process.env.ENCRYPTION_KEY = CURRENT_HEX;
    delete process.env.ENCRYPTION_KEY_VERSION;
    clearPrevious();

    expect([...getEncryptionKeys().keys()]).toEqual([1]);
  });

  it("returns both versions when the previous key is configured", () => {
    setCurrent(CURRENT_HEX, "2");
    setPrevious(PREVIOUS_HEX, "1");

    const keys = getEncryptionKeys();

    expect([...keys.keys()].sort((a, b) => a - b)).toEqual([1, 2]);
    expect(keys.get(1)?.toString("hex")).toBe(PREVIOUS_HEX);
    expect(keys.get(2)?.toString("hex")).toBe(CURRENT_HEX);
  });

  it("treats present-but-empty previous envs as not configured (regola 18)", () => {
    setCurrent(CURRENT_HEX, "2");
    process.env.ENCRYPTION_KEY_PREVIOUS = "";
    process.env.ENCRYPTION_KEY_PREVIOUS_VERSION = "";

    expect([...getEncryptionKeys().keys()]).toEqual([2]);
  });

  it("throws when the previous key is set without its version", () => {
    setCurrent(CURRENT_HEX, "2");
    clearPrevious();
    process.env.ENCRYPTION_KEY_PREVIOUS = PREVIOUS_HEX;

    expect(() => getEncryptionKeys()).toThrow(
      /ENCRYPTION_KEY_PREVIOUS_VERSION/,
    );
  });

  it("throws when the previous version is set without its key", () => {
    setCurrent(CURRENT_HEX, "2");
    clearPrevious();
    process.env.ENCRYPTION_KEY_PREVIOUS_VERSION = "1";

    expect(() => getEncryptionKeys()).toThrow(/ENCRYPTION_KEY_PREVIOUS/);
  });

  it.each(["abc123", "zz".repeat(32), "ab".repeat(31)])(
    "throws on a malformed previous key %s",
    (hex) => {
      setCurrent(CURRENT_HEX, "2");
      setPrevious(hex, "1");

      expect(() => getEncryptionKeys()).toThrow(/ENCRYPTION_KEY_PREVIOUS/);
    },
  );

  it.each(["0", "256", "abc", "1.5", ""])(
    "throws on an invalid previous version %s",
    (version) => {
      setCurrent(CURRENT_HEX, "2");
      process.env.ENCRYPTION_KEY_PREVIOUS = PREVIOUS_HEX;
      process.env.ENCRYPTION_KEY_PREVIOUS_VERSION = version;

      expect(() => getEncryptionKeys()).toThrow(
        /ENCRYPTION_KEY_PREVIOUS_VERSION/,
      );
    },
  );

  it("throws when previous and current share the same version", () => {
    setCurrent(CURRENT_HEX, "2");
    setPrevious(PREVIOUS_HEX, "2");

    expect(() => getEncryptionKeys()).toThrow(/same version/i);
  });

  it("throws when the previous key is a copy of the current key", () => {
    setCurrent(CURRENT_HEX, "2");
    setPrevious(CURRENT_HEX, "1");

    expect(() => getEncryptionKeys()).toThrow(/same key/i);
  });

  it("accepts a previous version higher than the current one (rollback)", () => {
    // Rollback di una rotazione: la chiave "precedente" è quella nuova, con
    // versione più alta. Legale — l'ordine delle versioni non è un vincolo.
    setCurrent(CURRENT_HEX, "2");
    setPrevious(PREVIOUS_HEX, "3");

    const keys = getEncryptionKeys();

    expect([...keys.keys()].sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("propagates the ENCRYPTION_KEY failure when the current key is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    clearPrevious();

    expect(() => getEncryptionKeys()).toThrow("ENCRYPTION_KEY");
  });
});

describe("key rotation E2E (REVIEW #17)", () => {
  const KEY_ENVS = [
    "ENCRYPTION_KEY",
    "ENCRYPTION_KEY_VERSION",
    "ENCRYPTION_KEY_PREVIOUS",
    "ENCRYPTION_KEY_PREVIOUS_VERSION",
  ] as const;
  const original = new Map(KEY_ENVS.map((name) => [name, process.env[name]]));

  const OLD_HEX = "11".repeat(32);
  const NEW_HEX = "22".repeat(32);

  afterEach(() => {
    for (const name of KEY_ENVS) {
      const value = original.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("decrypts v1 rows after rotating to v2 with both keys in env", () => {
    // Fase A: cifrato in produzione con la sola chiave v1.
    process.env.ENCRYPTION_KEY = OLD_HEX;
    process.env.ENCRYPTION_KEY_VERSION = "1";
    const stored = encrypt("PIN-1234", getEncryptionKey(), getKeyVersion());

    // Fase B: deploy con entrambe le chiavi, prima di ri-cifrare le righe.
    process.env.ENCRYPTION_KEY = NEW_HEX;
    process.env.ENCRYPTION_KEY_VERSION = "2";
    process.env.ENCRYPTION_KEY_PREVIOUS = OLD_HEX;
    process.env.ENCRYPTION_KEY_PREVIOUS_VERSION = "1";

    expect(decrypt(stored, getEncryptionKeys())).toBe("PIN-1234");
  });

  it("decrypts with the current key alone once the row is re-encrypted (fase C)", () => {
    process.env.ENCRYPTION_KEY = OLD_HEX;
    process.env.ENCRYPTION_KEY_VERSION = "1";
    const stored = encrypt("PIN-1234", getEncryptionKey(), getKeyVersion());

    process.env.ENCRYPTION_KEY = NEW_HEX;
    process.env.ENCRYPTION_KEY_VERSION = "2";
    process.env.ENCRYPTION_KEY_PREVIOUS = OLD_HEX;
    process.env.ENCRYPTION_KEY_PREVIOUS_VERSION = "1";

    // Ri-cifratura (scripts/rotate-encryption-key.ts) → riga marcata v2.
    const rotated = encrypt(
      decrypt(stored, getEncryptionKeys()),
      getEncryptionKey(),
      getKeyVersion(),
    );

    // Fase C: chiave precedente rimossa dall'env.
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    delete process.env.ENCRYPTION_KEY_PREVIOUS_VERSION;

    expect(decrypt(rotated, getEncryptionKeys())).toBe("PIN-1234");
  });

  it("fails explicitly when a stored version has no key in env", () => {
    process.env.ENCRYPTION_KEY = OLD_HEX;
    process.env.ENCRYPTION_KEY_VERSION = "1";
    const stored = encrypt("PIN-1234", getEncryptionKey(), getKeyVersion());

    // Rotazione senza chiave precedente in env: errore esplicito, non garbage.
    process.env.ENCRYPTION_KEY = NEW_HEX;
    process.env.ENCRYPTION_KEY_VERSION = "2";
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    delete process.env.ENCRYPTION_KEY_PREVIOUS_VERSION;

    expect(() => decrypt(stored, getEncryptionKeys())).toThrow(
      "Unknown key version: 1",
    );
  });
});
