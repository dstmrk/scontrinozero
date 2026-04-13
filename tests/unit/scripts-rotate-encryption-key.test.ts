// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../../src/lib/crypto";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockPostgresEnd,
  mockDrizzle,
  mockSelect,
  mockFrom,
  mockOrderBy,
  mockTransaction,
  mockUpdateSet,
} = vi.hoisted(() => {
  const mockPostgresEnd = vi.fn().mockResolvedValue(undefined);
  const mockOrderBy = vi.fn();
  const mockFrom = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  // Captures all .set({...}) calls inside the transaction for assertions
  const mockUpdateSet = vi.fn();

  const mockTransaction = vi.fn();

  const mockDrizzle = vi.fn();

  return {
    mockPostgresEnd,
    mockDrizzle,
    mockSelect,
    mockFrom,
    mockOrderBy,
    mockTransaction,
    mockUpdateSet,
  };
});

vi.mock("postgres", () => ({
  default: vi.fn().mockReturnValue({ end: mockPostgresEnd }),
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: mockDrizzle,
}));

vi.mock("@/db/schema", () => ({
  adeCredentials: {
    id: "ade_credentials_id_col",
    businessId: "business_id_col",
    encryptedCodiceFiscale: "enc_cf_col",
    encryptedPassword: "enc_pw_col",
    encryptedPin: "enc_pin_col",
    keyVersion: "key_version_col",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}));

import { rotateEncryptionKey } from "../../scripts/rotate-encryption-key";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKeyHex(): string {
  return randomBytes(32).toString("hex");
}

function makeRow(
  id: string,
  keyVersion: number,
  keyBuf: Buffer,
  cf = "TSTFSC00A01H501A",
  password = "password123",
  pin = "1234",
) {
  return {
    id,
    keyVersion,
    encryptedCodiceFiscale: encrypt(cf, keyBuf, keyVersion),
    encryptedPassword: encrypt(password, keyBuf, keyVersion),
    encryptedPin: encrypt(pin, keyBuf, keyVersion),
    businessId: "biz-id",
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const DB_URL = "postgresql://user:pass@db.example.supabase.co:5432/postgres";

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPostgresEnd.mockResolvedValue(undefined);

  // Default transaction: pass-through to callback, tx has update chain
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: (data: unknown) => {
            mockUpdateSet(data);
            return {
              where: vi.fn().mockResolvedValue(undefined),
            };
          },
        }),
      };
      return fn(tx);
    },
  );

  // Default db returned by drizzle()
  mockDrizzle.mockReturnValue({
    select: mockSelect,
    transaction: mockTransaction,
  });

  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ orderBy: mockOrderBy });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("rotateEncryptionKey", () => {
  it("re-encrypts all rows and returns correct counts", async () => {
    const oldKeyHex = makeKeyHex();
    const newKeyHex = makeKeyHex();
    const oldKeyBuf = Buffer.from(oldKeyHex, "hex");
    const newKeyBuf = Buffer.from(newKeyHex, "hex");

    const row1 = makeRow("id-1", 1, oldKeyBuf, "CF001", "pass001", "1111");
    const row2 = makeRow("id-2", 1, oldKeyBuf, "CF002", "pass002", "2222");

    mockOrderBy.mockResolvedValue([row1, row2]);

    const result = await rotateEncryptionKey({
      oldKey: oldKeyHex,
      oldVersion: 1,
      newKey: newKeyHex,
      newVersion: 2,
      databaseUrl: DB_URL,
    });

    expect(result).toEqual({ rotated: 2, skipped: 0 });
    expect(mockUpdateSet).toHaveBeenCalledTimes(2);
  });

  it("re-encrypted data decrypts correctly with new key", async () => {
    const oldKeyHex = makeKeyHex();
    const newKeyHex = makeKeyHex();
    const oldKeyBuf = Buffer.from(oldKeyHex, "hex");
    const newKeyBuf = Buffer.from(newKeyHex, "hex");

    const cf = "TSTFSC00A01H501A";
    const password = "s3cret!";
    const pin = "9999";

    const row = makeRow("id-1", 1, oldKeyBuf, cf, password, pin);
    mockOrderBy.mockResolvedValue([row]);

    await rotateEncryptionKey({
      oldKey: oldKeyHex,
      oldVersion: 1,
      newKey: newKeyHex,
      newVersion: 2,
      databaseUrl: DB_URL,
    });

    // Verify the data passed to set() decrypts correctly with the new key
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    const setCall = mockUpdateSet.mock.calls[0][0] as {
      encryptedCodiceFiscale: string;
      encryptedPassword: string;
      encryptedPin: string;
      keyVersion: number;
    };
    expect(setCall.keyVersion).toBe(2);

    const newKeys = new Map([[2, newKeyBuf]]);
    expect(decrypt(setCall.encryptedCodiceFiscale, newKeys)).toBe(cf);
    expect(decrypt(setCall.encryptedPassword, newKeys)).toBe(password);
    expect(decrypt(setCall.encryptedPin, newKeys)).toBe(pin);
  });

  it("skips rows already on the new key version", async () => {
    const oldKeyHex = makeKeyHex();
    const newKeyHex = makeKeyHex();
    const oldKeyBuf = Buffer.from(oldKeyHex, "hex");
    const newKeyBuf = Buffer.from(newKeyHex, "hex");

    const rowV1 = makeRow("id-1", 1, oldKeyBuf);
    const rowV2 = makeRow("id-2", 2, newKeyBuf); // already new version

    mockOrderBy.mockResolvedValue([rowV1, rowV2]);

    const result = await rotateEncryptionKey({
      oldKey: oldKeyHex,
      oldVersion: 1,
      newKey: newKeyHex,
      newVersion: 2,
      databaseUrl: DB_URL,
    });

    expect(result).toEqual({ rotated: 1, skipped: 1 });
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
  });

  it("returns { rotated: 0, skipped: 0 } when table is empty", async () => {
    mockOrderBy.mockResolvedValue([]);

    const result = await rotateEncryptionKey({
      oldKey: makeKeyHex(),
      oldVersion: 1,
      newKey: makeKeyHex(),
      newVersion: 2,
      databaseUrl: DB_URL,
    });

    expect(result).toEqual({ rotated: 0, skipped: 0 });
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("propagates error when decryption fails (wrong old key)", async () => {
    const realKeyHex = makeKeyHex();
    const wrongOldKeyHex = makeKeyHex(); // different from the real key used to encrypt
    const newKeyHex = makeKeyHex();
    const realKeyBuf = Buffer.from(realKeyHex, "hex");

    const row = makeRow("id-1", 1, realKeyBuf); // encrypted with realKey
    mockOrderBy.mockResolvedValue([row]);

    await expect(
      rotateEncryptionKey({
        oldKey: wrongOldKeyHex, // wrong key → decrypt will throw
        oldVersion: 1,
        newKey: newKeyHex,
        newVersion: 2,
        databaseUrl: DB_URL,
      }),
    ).rejects.toThrow();
  });

  it("always calls client.end() even when rotation fails", async () => {
    const realKeyHex = makeKeyHex();
    const wrongOldKeyHex = makeKeyHex();
    const realKeyBuf = Buffer.from(realKeyHex, "hex");

    const row = makeRow("id-1", 1, realKeyBuf);
    mockOrderBy.mockResolvedValue([row]);

    await expect(
      rotateEncryptionKey({
        oldKey: wrongOldKeyHex,
        oldVersion: 1,
        newKey: makeKeyHex(),
        newVersion: 2,
        databaseUrl: DB_URL,
      }),
    ).rejects.toThrow();

    expect(mockPostgresEnd).toHaveBeenCalledOnce();
  });

  it("calls client.end() on success", async () => {
    mockOrderBy.mockResolvedValue([]);

    await rotateEncryptionKey({
      oldKey: makeKeyHex(),
      oldVersion: 1,
      newKey: makeKeyHex(),
      newVersion: 2,
      databaseUrl: DB_URL,
    });

    expect(mockPostgresEnd).toHaveBeenCalledOnce();
  });
});
