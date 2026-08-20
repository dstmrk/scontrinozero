// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { profiles, businesses, adeCredentials } from "@/db/schema";

// ─── Mocks ────────────────────────────────────────────────────────────────

const { mockGetUser, mockSelect, mockGetProfilePlan, mockRedirect } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockSelect: vi.fn(),
    mockGetProfilePlan: vi.fn(),
    // `redirect()` di Next lancia NEXT_REDIRECT: il mock replica il throw così
    // un redirect inatteso non passa per un render riuscito.
    mockRedirect: vi.fn((..._args: unknown[]) => {
      throw new Error("NEXT_REDIRECT");
    }),
  }));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({ auth: { getUser: () => mockGetUser() } }),
}));

vi.mock("@/db", () => ({
  getDb: () => ({ select: (...args: unknown[]) => mockSelect(...args) }),
}));

vi.mock("@/server/billing-actions", () => ({
  getProfilePlan: () => mockGetProfilePlan(),
}));

vi.mock("@/lib/stripe", () => ({
  PRICE_IDS: {
    starterMonthly: "price_sm",
    starterYearly: "price_sy",
    proMonthly: "price_pm",
    proYearly: "price_py",
  },
}));

// Le sezioni figlie sono client component con hook (TanStack Query, next-themes,
// Web Bluetooth): stub per-id, così il test copre la STRUTTURA della pagina —
// ordine delle sezioni, raggruppamento in card — e non il loro interno, che ha
// già la sua suite.
vi.mock("@/components/settings/edit-profile-section", () => ({
  EditProfileSection: () => <div data-testid="edit-profile" />,
}));
vi.mock("@/components/settings/change-password-section", () => ({
  ChangePasswordSection: () => <div data-testid="change-password" />,
}));
vi.mock("@/components/settings/edit-business-section", () => ({
  EditBusinessSection: () => <div data-testid="edit-business" />,
}));
vi.mock("@/components/settings/edit-ade-credentials-section", () => ({
  EditAdeCredentialsSection: () => <div data-testid="edit-ade" />,
}));
vi.mock("@/components/settings/ade-credentials-section", () => ({
  AdeCredentialsSection: () => <div data-testid="ade-credentials" />,
}));
vi.mock("@/components/settings/referral-section", () => ({
  ReferralSection: () => <div data-testid="referral" />,
}));
vi.mock("@/components/settings/theme-section", () => ({
  ThemeSection: () => <div data-testid="theme" />,
}));
vi.mock("@/components/settings/printer-section", () => ({
  PrinterSection: () => <div data-testid="printer" />,
}));
vi.mock("@/components/settings/support-section", () => ({
  SupportSection: () => <div data-testid="support" />,
}));
vi.mock("@/components/settings/api-key-card", () => ({
  ApiKeyCard: () => <div data-testid="api-key" />,
}));
vi.mock("@/components/settings/export-data-section", () => ({
  ExportDataSection: () => <div data-testid="export-data" />,
}));
vi.mock("@/components/settings/account-delete-section", () => ({
  AccountDeleteSection: () => <div data-testid="account-delete" />,
}));
vi.mock("@/components/billing/plan-selection", () => ({
  PlanSelection: () => <div data-testid="plan-selection" />,
}));
vi.mock("@/components/billing/refresh-on-success", () => ({
  RefreshOnSuccess: () => null,
}));
vi.mock("@/components/billing/scroll-to-hash", () => ({
  ScrollToHash: () => null,
}));

import SettingsPage from "./page";

// ─── Fixture DB ───────────────────────────────────────────────────────────

const PROFILE = {
  id: "profile-1",
  authUserId: "user-1",
  firstName: "Mario",
  lastName: "Rossi",
  referralCode: "MARIO123",
};

const BUSINESS = {
  id: "biz-1",
  profileId: "profile-1",
  businessName: "Bar Centrale",
  vatNumber: "12345678901",
  fiscalCode: "RSSMRA80A01H501U",
  address: "Via Roma",
  streetNumber: "10",
  city: "Milano",
  province: "MI",
  zipCode: "20100",
  preferredVatCode: "22",
};

const CRED = { verifiedAt: new Date("2026-01-01"), loginMethod: "fisconline" };

/**
 * Query builder Drizzle finto: `.from(table)` sceglie la fixture per tabella,
 * `.where()`/`.limit()` sono passthrough e l'oggetto è thenable, come la query
 * reale che si risolve solo quando viene await-ata.
 */
function installDbFixtures({
  profile = PROFILE as Record<string, unknown> | null,
  business = BUSINESS as Record<string, unknown> | null,
  cred = CRED as Record<string, unknown> | null,
}: {
  // `null` = riga assente. Non `undefined`: su un parametro destrutturato con
  // default, passare `undefined` RIATTIVA il default e la fixture resterebbe
  // quella piena.
  profile?: Record<string, unknown> | null;
  business?: Record<string, unknown> | null;
  cred?: Record<string, unknown> | null;
} = {}) {
  mockSelect.mockImplementation(() => ({
    from: (table: unknown) => {
      let rows: unknown[];
      if (table === profiles) rows = profile ? [profile] : [];
      else if (table === businesses) rows = business ? [business] : [];
      else if (table === adeCredentials) rows = cred ? [cred] : [];
      else rows = [{ value: 2 }]; // referralRedemptions — count()

      const builder = {
        where: () => builder,
        limit: () => builder,
        then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
      };
      return builder;
    },
  }));
}

const PLAN_PRO = {
  plan: "pro",
  trialStartedAt: null,
  planExpiresAt: new Date("2026-12-31"),
  hasSubscription: true,
  subscriptionStatus: "active",
  subscriptionInterval: "month",
  cancelAtPeriodEnd: false,
};

async function renderSettings() {
  render(await SettingsPage({ searchParams: Promise.resolve({}) }));
}

/** Indice del primo nodo che contiene `text`, nell'ordine del DOM. */
function domOrderOf(text: string): number {
  const node = screen.getByText(text);
  const all = Array.from(document.querySelectorAll("*"));
  return all.indexOf(node);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "mario@example.com" } },
  });
  mockGetProfilePlan.mockResolvedValue(PLAN_PRO);
  installDbFixtures();
});

describe("SettingsPage — gerarchia delle sezioni", () => {
  it("mette 'Attività e fisco' prima di 'Account': è l'unica sezione con uno stato azionabile", async () => {
    await renderSettings();

    expect(domOrderOf("Attività e fisco")).toBeLessThan(domOrderOf("Account"));
  });

  it("mantiene le sezioni successive nell'ordine Abbonamento → Preferenze → Assistenza", async () => {
    await renderSettings();

    expect(domOrderOf("Account")).toBeLessThan(domOrderOf("Abbonamento"));
    expect(domOrderOf("Abbonamento")).toBeLessThan(domOrderOf("Preferenze"));
    expect(domOrderOf("Preferenze")).toBeLessThan(domOrderOf("Assistenza"));
  });
});

describe("SettingsPage — card Account unificata", () => {
  it("rende nome, email e cambio password in un'unica card", async () => {
    await renderSettings();

    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("mario@example.com")).toBeInTheDocument();
    expect(screen.getByTestId("change-password")).toBeInTheDocument();
    expect(screen.getByTestId("edit-profile")).toBeInTheDocument();
  });

  it("non rende più le card separate 'Profilo', 'Sicurezza' e 'Sessione'", async () => {
    await renderSettings();

    expect(screen.queryByText("Profilo")).not.toBeInTheDocument();
    expect(screen.queryByText("Sicurezza")).not.toBeInTheDocument();
    expect(screen.queryByText("Sessione")).not.toBeInTheDocument();
  });

  it("non duplica il logout: 'Esci' vive solo nell'header del dashboard", async () => {
    await renderSettings();

    expect(
      screen.queryByRole("button", { name: "Esci" }),
    ).not.toBeInTheDocument();
  });

  it("mostra 'Non impostato' quando il profilo non ha nome e cognome", async () => {
    installDbFixtures({
      profile: { ...PROFILE, firstName: null, lastName: null },
    });

    await renderSettings();

    expect(screen.getByText("Non impostato")).toBeInTheDocument();
  });
});

describe("SettingsPage — edge case dei dati mancanti", () => {
  it("rende la card Account anche senza riga profile a DB", async () => {
    installDbFixtures({ profile: null, business: null });

    await renderSettings();

    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Non impostato")).toBeInTheDocument();
    expect(screen.getByText("mario@example.com")).toBeInTheDocument();
  });

  it("omette la card Attività senza business, ma tiene Credenziali AdE", async () => {
    installDbFixtures({ business: null, cred: null });

    await renderSettings();

    expect(screen.queryByText("Attività")).not.toBeInTheDocument();
    expect(screen.getByText("Credenziali AdE")).toBeInTheDocument();
    expect(screen.getByTestId("ade-credentials")).toBeInTheDocument();
  });

  it("tiene 'Attività e fisco' in cima anche quando il piano non è leggibile", async () => {
    mockGetProfilePlan.mockResolvedValue({ error: "db down" });

    await renderSettings();

    expect(domOrderOf("Attività e fisco")).toBeLessThan(domOrderOf("Account"));
    expect(screen.queryByText("Piano e Abbonamento")).not.toBeInTheDocument();
  });
});

describe("SettingsPage — card Preferenze unificata", () => {
  it("tiene tema e stampante nella stessa card, sotto due sotto-titoli", async () => {
    await renderSettings();

    const card = screen.getByText("Preferenze").closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(card).toContainElement(screen.getByTestId("theme"));
    expect(card).toContainElement(screen.getByTestId("printer"));
    expect(card).toContainElement(screen.getByText("Aspetto"));
    expect(card).toContainElement(screen.getByText("Stampante"));
  });

  it("non rende più un heading di sezione 'Supporto' sopra la card Assistenza", async () => {
    await renderSettings();

    expect(screen.queryByText("Supporto")).not.toBeInTheDocument();
    expect(screen.getByTestId("support")).toBeInTheDocument();
  });
});

describe("SettingsPage — Informazioni senza card", () => {
  it("mostra versione e build come riga di testo dentro 'Altre impostazioni'", async () => {
    await renderSettings();

    fireEvent.click(screen.getByRole("button", { name: /Altre impostazioni/ }));

    const versionLine = screen.getByText(/ScontrinoZero \d/);
    expect(versionLine).toBeInTheDocument();
    expect(versionLine.closest('[data-slot="card"]')).toBeNull();
    expect(screen.queryByText("Informazioni")).not.toBeInTheDocument();
  });
});
