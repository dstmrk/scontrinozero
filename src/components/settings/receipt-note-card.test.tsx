import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TRIAL_DAYS } from "@/lib/plans-shared";
import { ReceiptNoteCard } from "./receipt-note-card";

// ReceiptNoteSection è un client component con react-query: qui interessa solo
// SE viene reso, non cosa rende (ha la sua suite).
vi.mock("./receipt-note-section", () => ({
  ReceiptNoteSection: ({
    businessId,
    initialNote,
  }: {
    businessId: string;
    initialNote: string | null;
  }) => (
    <div data-testid="receipt-note-section">
      {businessId}:{initialNote ?? "vuota"}
    </div>
  ),
}));

const BIZ_ID = "biz-uuid";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function renderCard(props: {
  plan: Parameters<typeof ReceiptNoteCard>[0]["plan"];
  note?: string | null;
  planExpiresAt?: Date | null;
  trialStartedAt?: Date | null;
}) {
  return render(
    <ReceiptNoteCard
      businessId={BIZ_ID}
      note={props.note ?? null}
      plan={props.plan}
      planExpiresAt={props.planExpiresAt ?? null}
      trialStartedAt={props.trialStartedAt ?? null}
    />,
  );
}

describe("ReceiptNoteCard — stato sbloccato", () => {
  it("rende il campo su piano Pro, con la nota salvata", () => {
    renderCard({ plan: "pro", note: "Arrivederci e grazie!" });

    expect(screen.getByTestId("receipt-note-section")).toHaveTextContent(
      `${BIZ_ID}:Arrivederci e grazie!`,
    );
    expect(
      screen.queryByRole("link", { name: /Passa a Pro/ }),
    ).not.toBeInTheDocument();
  });

  // Il link vive fuori dal gate: anche chi non ha la feature deve poter leggere
  // cosa fa prima di pagarla.
  it("linka l'articolo del centro assistenza in entrambi gli stati", () => {
    const { unmount } = renderCard({ plan: "pro" });
    expect(screen.getByRole("link", { name: "Come funziona" })).toHaveAttribute(
      "href",
      "/help/messaggio-personalizzato-scontrino",
    );
    unmount();

    renderCard({ plan: "starter" });
    expect(screen.getByRole("link", { name: "Come funziona" })).toHaveAttribute(
      "href",
      "/help/messaggio-personalizzato-scontrino",
    );
  });

  it("rende il campo su unlimited", () => {
    renderCard({ plan: "unlimited" });
    expect(screen.getByTestId("receipt-note-section")).toBeInTheDocument();
  });

  // Il trial è una prova di Pro: la feature si assaggia durante la prova.
  it("rende il campo durante un trial attivo", () => {
    renderCard({ plan: "trial", trialStartedAt: daysAgo(TRIAL_DAYS - 1) });
    expect(screen.getByTestId("receipt-note-section")).toBeInTheDocument();
  });
});

describe("ReceiptNoteCard — stato bloccato", () => {
  // La card resta visibile anche senza accesso: nasconderla farebbe perdere
  // l'upsell a chi non sa che la feature esiste (lezione di ApiKeyCard).
  it("mostra l'upsell a Starter, senza nascondere la card", () => {
    renderCard({ plan: "starter" });

    expect(screen.getByText("Personalizza lo scontrino")).toBeInTheDocument();
    expect(
      screen.queryByTestId("receipt-note-section"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Passa a Pro/ })).toHaveAttribute(
      "href",
      "/dashboard/settings#billing",
    );
  });

  it("mostra l'upsell a trial scaduto", () => {
    renderCard({ plan: "trial", trialStartedAt: daysAgo(TRIAL_DAYS + 1) });
    expect(
      screen.queryByTestId("receipt-note-section"),
    ).not.toBeInTheDocument();
  });

  // Safety-net webhook Stripe perso: piano pagato scaduto oltre la grazia.
  it("mostra l'upsell a un piano pagato scaduto oltre la grazia", () => {
    renderCard({ plan: "pro", planExpiresAt: daysAgo(365) });
    expect(
      screen.queryByTestId("receipt-note-section"),
    ).not.toBeInTheDocument();
  });
});
