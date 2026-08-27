// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockWithStatementTimeout } = vi.hoisted(() => ({
  mockWithStatementTimeout: vi.fn(),
}));

// Passthrough: qui interessa il TETTO di concorrenza, non la transazione.
vi.mock("@/lib/db-timeout", () => ({
  withStatementTimeout: async (
    timeoutMs: number,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    mockWithStatementTimeout(timeoutMs);
    return fn({ execute: vi.fn() });
  },
}));

import {
  ADMIN_MAX_CONCURRENT_READS,
  ADMIN_QUERY_TIMEOUT_MS,
  runAdminRead,
  toNullableText,
  toNumber,
  toRows,
  toText,
} from "./admin-sql";

/** Cede il controllo al loop: garantisce che ogni microtask pendente sia girato. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("toNumber", () => {
  it("converte i bigint che il driver consegna come stringa", () => {
    expect(toNumber("1234567")).toBe(1234567);
  });

  it("lascia passare un numero finito", () => {
    expect(toNumber(42)).toBe(42);
  });

  it("tratta come 0 null, undefined e valori non numerici", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber({})).toBe(0);
    expect(toNumber("non-un-numero")).toBe(0);
    expect(toNumber(Number.NaN)).toBe(0);
    expect(toNumber(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("toRows", () => {
  it("passa attraverso un array già parsato", () => {
    expect(toRows([{ a: 1 }])).toEqual([{ a: 1 }]);
  });

  it("parsa un json consegnato come testo", () => {
    expect(toRows('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it("degrada a elenco vuoto su json illeggibile o non-array", () => {
    expect(toRows("{non-json")).toEqual([]);
    expect(toRows('{"a":1}')).toEqual([]);
    expect(toRows(null)).toEqual([]);
    expect(toRows(undefined)).toEqual([]);
  });
});

describe("toNullableText / toText", () => {
  it("toNullableText normalizza a null tutto ciò che non è testo non vuoto", () => {
    expect(toNullableText("Mario")).toBe("Mario");
    expect(toNullableText("")).toBeNull();
    expect(toNullableText(null)).toBeNull();
    expect(toNullableText(7)).toBeNull();
  });

  it("toText non restituisce mai null", () => {
    expect(toText("a@b.it")).toBe("a@b.it");
    expect(toText(null)).toBe("");
  });
});

describe("ADMIN_QUERY_TIMEOUT_MS", () => {
  it("è un intero positivo, come richiede withStatementTimeout", () => {
    expect(Number.isInteger(ADMIN_QUERY_TIMEOUT_MS)).toBe(true);
    expect(ADMIN_QUERY_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe("runAdminRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tiene una sola lettura per volta", () => {
    // Il tetto è il contratto verso il pool: se qualcuno lo alza, i test qui
    // sotto sull'accodamento vanno riletti, non solo aggiornati.
    expect(ADMIN_MAX_CONCURRENT_READS).toBe(1);
  });

  it("applica il budget di timeout a ogni lettura", async () => {
    await runAdminRead(async () => "ok");

    expect(mockWithStatementTimeout).toHaveBeenCalledWith(
      ADMIN_QUERY_TIMEOUT_MS,
    );
  });

  it("non lascia partire la seconda lettura finché la prima non ha finito", async () => {
    const first = deferred<string>();
    const started: string[] = [];

    const a = runAdminRead(async () => {
      started.push("a");
      return first.promise;
    });
    const b = runAdminRead(async () => {
      started.push("b");
      return "b";
    });

    await flush();
    expect(started).toEqual(["a"]);

    first.resolve("a");

    await expect(a).resolves.toBe("a");
    await expect(b).resolves.toBe("b");
    expect(started).toEqual(["a", "b"]);
  });

  it("serve la coda in ordine di arrivo", async () => {
    const first = deferred<string>();
    const started: string[] = [];

    const reads = [
      runAdminRead(async () => {
        started.push("a");
        return first.promise;
      }),
      runAdminRead(async () => {
        started.push("b");
        return "b";
      }),
      runAdminRead(async () => {
        started.push("c");
        return "c";
      }),
    ];

    first.resolve("a");
    await Promise.all(reads);

    expect(started).toEqual(["a", "b", "c"]);
  });

  it("rilascia il posto anche quando la query lancia", async () => {
    // Il caso che trasformerebbe un timeout Postgres in un pannello morto:
    // senza `finally` la prima lettura fallita terrebbe l'unico posto e ogni
    // blocco successivo resterebbe sullo skeleton per sempre.
    await expect(
      runAdminRead(async () => {
        throw new Error("57014");
      }),
    ).rejects.toThrow("57014");

    await expect(runAdminRead(async () => "dopo")).resolves.toBe("dopo");
  });
});
