import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TRIAL_DAYS } from "@/lib/plans-shared";
import { ApiKeyCard } from "./api-key-card";

// ApiKeySection e' un client component con react-query: qui interessa solo
// SE viene reso, non cosa rende.
vi.mock("./api-key-section", () => ({
  ApiKeySection: ({ businessId }: { businessId: string }) => (
    <div data-testid="api-key-section">{businessId}</div>
  ),
}));

const BIZ_ID = "biz-uuid";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function renderCard(props: {
  plan: Parameters<typeof ApiKeyCard>[0]["plan"];
  planExpiresAt?: Date | null;
  trialStartedAt?: Date | null;
}) {
  return render(
    <ApiKeyCard
      businessId={BIZ_ID}
      plan={props.plan}
      planExpiresAt={props.planExpiresAt ?? null}
      trialStartedAt={props.trialStartedAt ?? null}
    />,
  );
}

describe("ApiKeyCard — stato sbloccato", () => {
  it("rende la gestione chiavi su piano Pro", () => {
    renderCard({ plan: "pro" });

    expect(screen.getByTestId("api-key-section")).toHaveTextContent(BIZ_ID);
    expect(
      screen.queryByRole("link", { name: /passa a pro/i }),
    ).not.toBeInTheDocument();
  });

  it("rende la gestione chiavi durante un trial attivo", () => {
    renderCard({ plan: "trial", trialStartedAt: daysAgo(5) });

    expect(screen.getByTestId("api-key-section")).toBeInTheDocument();
  });

  it("avvisa che le chiavi del trial scadono con la prova", () => {
    renderCard({ plan: "trial", trialStartedAt: daysAgo(5) });

    expect(screen.getByText(/al termine della prova/i)).toBeInTheDocument();
  });

  // Regressione: `ProFeatureGate` gira su canUsePro e bloccherebbe i piani
  // developer_*, che l'API la usano come unico canale di emissione.
  it("rende la gestione chiavi sui piani developer", () => {
    renderCard({ plan: "developer_indie" });

    expect(screen.getByTestId("api-key-section")).toBeInTheDocument();
  });

  it("non mostra l'avviso di scadenza a chi e' gia' su Pro", () => {
    renderCard({ plan: "pro" });

    expect(
      screen.queryByText(/al termine della prova/i),
    ).not.toBeInTheDocument();
  });
});

describe("ApiKeyCard — stato bloccato", () => {
  // Il motivo per cui questa card esiste: su Starter il box spariva del tutto
  // e l'utente non sapeva nemmeno che la Developer API esistesse.
  it("resta visibile su Starter, con l'upsell al posto della gestione chiavi", () => {
    renderCard({ plan: "starter" });

    expect(screen.getByText("API key")).toBeInTheDocument();
    expect(screen.queryByTestId("api-key-section")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /passa a pro/i })).toHaveAttribute(
      "href",
      "/dashboard/settings#billing",
    );
  });

  it("blocca un trial scaduto", () => {
    renderCard({ plan: "trial", trialStartedAt: daysAgo(TRIAL_DAYS + 1) });

    expect(screen.queryByTestId("api-key-section")).not.toBeInTheDocument();
  });

  it("blocca un piano a pagamento scaduto oltre la grazia", () => {
    renderCard({ plan: "pro", planExpiresAt: daysAgo(31) });

    expect(screen.queryByTestId("api-key-section")).not.toBeInTheDocument();
  });
});

describe("ApiKeyCard — documentazione", () => {
  it("linka la doc API con un path relativo in entrambi gli stati", () => {
    const { unmount } = renderCard({ plan: "pro" });
    expect(
      screen.getByRole("link", { name: /documentazione/i }),
    ).toHaveAttribute("href", "/help/api");
    unmount();

    renderCard({ plan: "starter" });
    expect(
      screen.getByRole("link", { name: /documentazione/i }),
    ).toHaveAttribute("href", "/help/api");
  });
});
