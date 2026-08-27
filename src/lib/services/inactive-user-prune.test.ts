// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PruneConfig } from "./inactive-user-prune-config";
import { sqlTextOf } from "../../../tests/_helpers/sql-text";

const mockExecute = vi.fn();
const mockWhere = vi.fn().mockResolvedValue(undefined);
const mockSet = vi.fn((_values: { inactivityWarningSentAt: Date | null }) => ({
  where: mockWhere,
}));
const mockUpdate = vi.fn(() => ({ set: mockSet }));
vi.mock("@/db", () => ({
  getDb: () => ({ execute: mockExecute, update: mockUpdate }),
}));

const mockPurgeUserById = vi.fn();
vi.mock("@/lib/services/purge-user", () => ({
  purgeUserById: (id: string) => mockPurgeUserById(id),
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({ sendEmail: (o: unknown) => mockSendEmail(o) }));

const mockGetTrustedAppUrl = vi.fn(() => "https://app.test");
vi.mock("@/lib/trusted-app-url", () => ({
  getTrustedAppUrl: () => mockGetTrustedAppUrl(),
}));

const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: mockLoggerError, warn: mockLoggerWarn, info: vi.fn() },
}));

// Passthrough: la tx espone lo stesso `execute` mockato, così le query dentro e
// fuori dal wrapper finiscono nella stessa coda di `mockExecute` e i test già
// scritti (che contano le chiamate) non cambiano. Il budget passato al wrapper
// è registrato a parte perché è metà del contratto di questa slice.
const mockWithStatementTimeout = vi.fn();
vi.mock("@/lib/db-timeout", () => ({
  withStatementTimeout: async (
    timeoutMs: number,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    mockWithStatementTimeout(timeoutMs);
    return fn({ execute: mockExecute });
  },
}));

vi.mock("@/emails/account-inactivity-warning", () => ({
  AccountInactivityWarningEmail: vi.fn(() => null),
}));
vi.mock("@/emails/account-inactivity-deletion", () => ({
  AccountInactivityDeletionEmail: vi.fn(() => null),
}));

const NOW = new Date("2026-07-01T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const CONFIG: PruneConfig = {
  enabled: true,
  deleteAfterDays: 365,
  warnBeforeDays: 30,
  warnings: [],
};

describe("isProtectedFromPrune", () => {
  it.each([
    {
      name: "protegge unlimited sempre",
      plan: "unlimited",
      expiresAt: null,
      expected: true,
    },
    {
      name: "NON protegge il trial",
      plan: "trial",
      expiresAt: null,
      expected: false,
    },
    {
      name: "protegge un piano a pagamento ancora attivo",
      plan: "pro",
      expiresAt: new Date(NOW.getTime() + 30 * 86_400_000),
      expected: true,
    },
    {
      name: "protegge un piano a pagamento con scadenza sconosciuta (null) — fail-safe",
      plan: "pro",
      expiresAt: null,
      expected: true,
    },
    {
      name: "NON protegge un piano a pagamento scaduto oltre la grazia",
      plan: "pro",
      expiresAt: new Date(NOW.getTime() - 400 * 86_400_000),
      expected: false,
    },
    {
      name: "protegge un plan sconosciuto (drift schema)",
      plan: "mystery",
      expiresAt: null,
      expected: true,
    },
  ] as {
    name: string;
    plan: string;
    expiresAt: Date | null;
    expected: boolean;
  }[])("$name", async ({ plan, expiresAt, expected }) => {
    const { isProtectedFromPrune } = await import("./inactive-user-prune");
    expect(isProtectedFromPrune(plan, expiresAt, NOW.getTime())).toBe(expected);
  });
});

describe("pruneInactiveUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPurgeUserById.mockResolvedValue({
      authDeleted: true,
      profileDeleted: true,
    });
    mockSendEmail.mockResolvedValue(undefined);
    mockWhere.mockResolvedValue(undefined);
    mockGetTrustedAppUrl.mockReturnValue("https://app.test");
  });

  const warnRow = (overrides: Record<string, unknown> = {}) => ({
    auth_user_id: "w1",
    email: "w@t.it",
    first_name: "Wanda",
    plan: "trial",
    plan_expires_at: null,
    inactivity_warning_sent_at: null,
    last_activity_at: daysAgo(340),
    ...overrides,
  });

  const deleteRow = (overrides: Record<string, unknown> = {}) => ({
    auth_user_id: "d1",
    email: "d@t.it",
    first_name: null,
    plan: "trial",
    plan_expires_at: null,
    inactivity_warning_sent_at: daysAgo(31),
    last_activity_at: daysAgo(400),
    ...overrides,
  });

  it("preavvisa, cancella e resetta secondo lo stato di ogni utente", async () => {
    mockExecute.mockResolvedValueOnce([
      // WARN: inattivo oltre 335gg, mai preavvisato, trial
      {
        auth_user_id: "w1",
        email: "w@t.it",
        first_name: "Wanda",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: null,
        last_activity_at: daysAgo(340),
      },
      // DELETE: inattivo >365gg, preavvisato 31gg fa, trial
      {
        auth_user_id: "d1",
        email: "d@t.it",
        first_name: null,
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(31),
        last_activity_at: daysAgo(400),
      },
      // RESET: tornato attivo (10gg fa) pur essendo stato preavvisato
      {
        auth_user_id: "r1",
        email: "r@t.it",
        first_name: "Rino",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(40),
        last_activity_at: daysAgo(10),
      },
      // PROTECTED: abbonato pro attivo, nessuna azione
      {
        auth_user_id: "p1",
        email: "p@t.it",
        first_name: "Pia",
        plan: "pro",
        plan_expires_at: new Date(NOW.getTime() + 30 * 86_400_000),
        inactivity_warning_sent_at: null,
        last_activity_at: daysAgo(400),
      },
      // WAITING: inattivo >365gg ma preavvisato solo 10gg fa (grazia non scaduta)
      {
        auth_user_id: "g1",
        email: "g@t.it",
        first_name: "Gino",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(10),
        last_activity_at: daysAgo(400),
      },
      // RESET-PROTECTED: preavvisato ma ora unlimited → azzera
      {
        auth_user_id: "rp1",
        email: "rp@t.it",
        first_name: "Ada",
        plan: "unlimited",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(40),
        last_activity_at: daysAgo(400),
      },
    ]);

    // Ri-lettura di d1 prima del purge (REVIEW #40): conferma l'eleggibilità.
    mockExecute.mockResolvedValue([deleteRow()]);

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    expect(result).toEqual({ warned: 1, deleted: 1, reset: 2 });

    // Solo d1 viene cancellato
    expect(mockPurgeUserById).toHaveBeenCalledTimes(1);
    expect(mockPurgeUserById).toHaveBeenCalledWith("d1");

    // Due email: preavviso a w1, conferma cancellazione a d1
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "w@t.it",
        subject: expect.stringContaining("sta per essere eliminato"),
      }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "d@t.it",
        subject: "Il tuo account ScontrinoZero è stato eliminato",
      }),
    );

    // Tre update: w1 (set now), r1 (null), rp1 (null) — non g1/p1
    const setValues = mockSet.mock.calls.map(
      (c) => c[0].inactivityWarningSentAt,
    );
    expect(setValues).toHaveLength(3);
    expect(setValues.filter((v) => v === null)).toHaveLength(2);
    expect(setValues.filter((v) => v instanceof Date)).toHaveLength(1);
  });

  it("include last_seen_at nel calcolo dell'attività (SELECT e WHERE)", async () => {
    // Segnale visita autenticata (touch in server-auth.ts): senza questo, un
    // utente PWA con sessione persistente che usa l'app in sola lettura
    // risulterebbe inattivo (last_sign_in_at non si aggiorna sul refresh
    // token) e verrebbe cancellato pur essendo attivo.
    mockExecute.mockResolvedValue([]);

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    await pruneInactiveUsers(NOW, CONFIG);

    const sqlText = JSON.stringify(mockExecute.mock.calls[0]?.[0]);
    const occurrences = sqlText.match(/last_seen_at/g) ?? [];
    // Due GREATEST (colonna SELECT + clausola WHERE): entrambi devono
    // includere COALESCE(p.last_seen_at, p.created_at).
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("degrada a zero senza lanciare se la query candidati fallisce", async () => {
    mockExecute.mockRejectedValue(new Error("DB down"));

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    expect(result).toEqual({ warned: 0, deleted: 0, reset: 0 });
    expect(mockPurgeUserById).not.toHaveBeenCalled();
  });

  describe("contenimento della query candidati (REVIEW #81)", () => {
    it("esegue la SELECT candidati dentro withStatementTimeout col budget di background", async () => {
      mockExecute.mockResolvedValue([]);

      const { pruneInactiveUsers, PRUNE_CANDIDATES_QUERY_TIMEOUT_MS } =
        await import("./inactive-user-prune");
      await pruneInactiveUsers(NOW, CONFIG);

      expect(mockWithStatementTimeout).toHaveBeenCalledWith(
        PRUNE_CANDIDATES_QUERY_TIMEOUT_MS,
      );
    });

    it("ordina in modo deterministico e limita la dimensione del batch", async () => {
      mockExecute.mockResolvedValue([]);

      const { pruneInactiveUsers, PRUNE_CANDIDATES_BATCH_LIMIT } =
        await import("./inactive-user-prune");
      await pruneInactiveUsers(NOW, CONFIG);

      // Si verifica COSA fa la query (ordina e limita), non la sua forma
      // esatta — vedi il commento di `sqlTextOf`.
      const sqlText = sqlTextOf(mockExecute.mock.calls[0]?.[0]);
      expect(sqlText).toContain("ORDER BY");
      // Tiebreak sulla chiave unica: senza, due righe con la stessa attività
      // possono alternarsi fra uno sweep e l'altro e restare entrambe fuori
      // dal LIMIT per sempre.
      expect(sqlText).toContain("auth_user_id ASC");
      expect(sqlText).toContain("LIMIT");
      expect(sqlText).toContain(String(PRUNE_CANDIDATES_BATCH_LIMIT));
    });

    it("su statement timeout (57014) degrada a zero con warn, non con error", async () => {
      // Ha già il suo retry implicito — lo sweep del giorno dopo — quindi non
      // deve aprire una issue Sentry a ogni giro di contention.
      mockExecute.mockRejectedValue({ code: "57014" });

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(result).toEqual({ warned: 0, deleted: 0, reset: 0 });
      expect(mockPurgeUserById).not.toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalled();
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it("avvolge SOLO la query candidati, non la ri-lettura pre-purge", async () => {
      // Il ramo delete fa due query: candidati + ri-lettura. Il wrapper deve
      // restare sulla prima. La ri-lettura è un lookup su un profilo solo, e
      // tirarla dentro una transazione la accoppierebbe al purge che la segue.
      mockExecute
        .mockResolvedValueOnce([deleteRow()])
        .mockResolvedValueOnce([deleteRow()]);

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(result.deleted).toBe(1);
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(mockWithStatementTimeout).toHaveBeenCalledTimes(1);
    });

    it("un 57014 dalla ri-lettura salta il purge, non l'intero sweep", async () => {
      // 57014 ha un significato speciale solo sulla query candidati. Sulla
      // ri-lettura resta un fallimento come gli altri: fail-safe, non si
      // cancella, ma lo sweep prosegue e i contatori non sono azzerati.
      mockExecute
        .mockResolvedValueOnce([warnRow(), deleteRow()])
        .mockRejectedValueOnce({ code: "57014" });

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(mockPurgeUserById).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
      expect(result.warned).toBe(1);
    });

    it("su un errore DB senza retry automatico resta su logger.error", async () => {
      mockExecute.mockRejectedValue(new Error("DB down"));

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(result).toEqual({ warned: 0, deleted: 0, reset: 0 });
      expect(mockLoggerError).toHaveBeenCalled();
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });

  it("un fallimento su un utente non aborta il batch", async () => {
    mockExecute.mockResolvedValue([
      {
        auth_user_id: "w1",
        email: "w@t.it",
        first_name: "Wanda",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: null,
        last_activity_at: daysAgo(340),
      },
      {
        auth_user_id: "w2",
        email: "w2@t.it",
        first_name: "Bea",
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: null,
        last_activity_at: daysAgo(341),
      },
    ]);
    // Il primo invio email lancia, il secondo va a buon fine
    mockSendEmail
      .mockRejectedValueOnce(new Error("Resend down"))
      .mockResolvedValueOnce(undefined);

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    // w1 fallisce (non conteggiato), w2 preavvisato
    expect(result.warned).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("non cancella se purgeUserById riporta authDeleted false", async () => {
    mockPurgeUserById.mockResolvedValue({
      authDeleted: false,
      profileDeleted: false,
    });
    mockExecute.mockResolvedValue([
      {
        auth_user_id: "d1",
        email: "d@t.it",
        first_name: null,
        plan: "trial",
        plan_expires_at: null,
        inactivity_warning_sent_at: daysAgo(31),
        last_activity_at: daysAgo(400),
      },
    ]);

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    expect(result.deleted).toBe(0);
    // Nessuna email di conferma se la cancellazione auth non è avvenuta
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("cancella comunque anche se l'email di conferma fallisce (fire-and-forget)", async () => {
    mockExecute.mockResolvedValue([deleteRow()]);
    mockSendEmail.mockRejectedValue(new Error("Resend down"));

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    // La cancellazione conta comunque: l'email è best-effort.
    expect(result.deleted).toBe(1);
    expect(mockPurgeUserById).toHaveBeenCalledWith("d1");
    // Flush del microtask del .catch dell'invio fire-and-forget.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "pruneInactiveUsers: email conferma cancellazione fallita",
    );
  });

  it("gestisce date come stringa e first_name null; salta le righe senza attività", async () => {
    mockExecute.mockResolvedValue([
      // Date come stringa ISO (ramo string di toDate) + first_name null (?? "")
      warnRow({
        auth_user_id: "s1",
        first_name: null,
        last_activity_at: daysAgo(340).toISOString(),
      }),
      // last_activity_at null → nessuna azione (guardia !lastActivity)
      warnRow({ auth_user_id: "n1", last_activity_at: null }),
    ]);

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    // Solo s1 preavvisato; la riga senza attività è ignorata.
    expect(result.warned).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        react: expect.objectContaining({
          props: expect.objectContaining({ firstName: "" }),
        }),
      }),
    );
  });

  describe("ri-lettura prima del purge (REVIEW #40)", () => {
    // Lo snapshot dei candidati è preso a inizio sweep, ma il loop processa gli
    // utenti in sequenza con side-effect lenti (email fino a 8s l'una): con N
    // utenti il batch dura minuti. Un utente che torna attivo o si abbona TRA la
    // SELECT e l'elaborazione della sua riga non deve essere cancellato sullo
    // snapshot vecchio.

    it("NON cancella se alla ri-lettura l'utente è tornato attivo", async () => {
      mockExecute
        .mockResolvedValueOnce([deleteRow()])
        // Riga fresca: ha fatto login 2 giorni fa mentre il batch girava.
        .mockResolvedValueOnce([deleteRow({ last_activity_at: daysAgo(2) })]);

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(mockPurgeUserById).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
      // Tornato attivo con un preavviso pendente → il flag va azzerato.
      expect(result.reset).toBe(1);
      expect(mockSet).toHaveBeenCalledWith({ inactivityWarningSentAt: null });
    });

    it("NON cancella se alla ri-lettura l'utente è diventato protetto (si è abbonato)", async () => {
      mockExecute.mockResolvedValueOnce([deleteRow()]).mockResolvedValueOnce([
        deleteRow({
          plan: "pro",
          plan_expires_at: new Date(NOW.getTime() + 30 * 86_400_000),
        }),
      ]);

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(mockPurgeUserById).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
      expect(result.reset).toBe(1);
    });

    it("NON cancella se alla ri-lettura il preavviso non è più nella grazia", async () => {
      mockExecute
        .mockResolvedValueOnce([deleteRow()])
        // Preavviso ri-emesso 1 giorno fa: la grazia di 30gg non è scaduta.
        .mockResolvedValueOnce([
          deleteRow({ inactivity_warning_sent_at: daysAgo(1) }),
        ]);

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(mockPurgeUserById).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
    });

    it("cancella quando la ri-lettura conferma l'eleggibilità", async () => {
      mockExecute
        .mockResolvedValueOnce([deleteRow()])
        .mockResolvedValueOnce([deleteRow()]);

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(mockPurgeUserById).toHaveBeenCalledWith("d1");
      expect(result.deleted).toBe(1);
    });

    it("NON cancella se la riga è sparita alla ri-lettura", async () => {
      mockExecute
        .mockResolvedValueOnce([deleteRow()])
        .mockResolvedValueOnce([]);

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(mockPurgeUserById).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
    });

    it("NON cancella se la ri-lettura fallisce (fail-safe: nel dubbio non si cancella)", async () => {
      mockExecute
        .mockResolvedValueOnce([deleteRow()])
        .mockRejectedValueOnce(new Error("statement timeout"));

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(mockPurgeUserById).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        "pruneInactiveUsers: ri-lettura candidato fallita, purge saltato",
      );
    });

    it("NON cancella se alla ri-lettura è protetto e il preavviso è già stato azzerato", async () => {
      // Il flag può essere già stato ripulito da un reset concorrente: senza
      // preavviso pendente non c'è nulla da azzerare, ma il purge resta vietato.
      mockExecute.mockResolvedValueOnce([deleteRow()]).mockResolvedValueOnce([
        deleteRow({
          inactivity_warning_sent_at: null,
          plan: "pro",
          plan_expires_at: new Date(NOW.getTime() + 30 * 86_400_000),
        }),
      ]);

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(mockPurgeUserById).not.toHaveBeenCalled();
      expect(result).toEqual({ warned: 0, deleted: 0, reset: 0 });
      // Nessuna scrittura: non c'era preavviso da azzerare.
      expect(mockSet).not.toHaveBeenCalled();
    });

    it("NON cancella se la riga riletta non ha attività calcolabile", async () => {
      mockExecute
        .mockResolvedValueOnce([deleteRow()])
        .mockResolvedValueOnce([deleteRow({ last_activity_at: null })]);

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      const result = await pruneInactiveUsers(NOW, CONFIG);

      expect(mockPurgeUserById).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
    });

    it("NON aggiunge query sul ramo warn (costo solo sul delete)", async () => {
      mockExecute.mockResolvedValueOnce([warnRow()]);

      const { pruneInactiveUsers } = await import("./inactive-user-prune");
      await pruneInactiveUsers(NOW, CONFIG);

      // Una sola query: la SELECT dei candidati.
      expect(mockExecute).toHaveBeenCalledOnce();
    });
  });

  it("usa l'URL di login di fallback se getTrustedAppUrl lancia", async () => {
    mockGetTrustedAppUrl.mockImplementation(() => {
      throw new Error("identity env non pronta");
    });
    mockExecute.mockResolvedValue([warnRow()]);

    const { pruneInactiveUsers } = await import("./inactive-user-prune");
    const result = await pruneInactiveUsers(NOW, CONFIG);

    expect(result.warned).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        react: expect.objectContaining({
          props: expect.objectContaining({
            loginUrl: "https://app.scontrinozero.it/login",
          }),
        }),
      }),
    );
  });
});
