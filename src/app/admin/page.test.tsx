// @vitest-environment jsdom
import { Suspense, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Le sezioni sono server component asincroni: `react-dom` lato client non sa
 * renderizzarle, e il loro contenuto ha già i suoi test in `sections.test.tsx`.
 * Qui interessa solo il **cablaggio**: quale periodo ricevono e dietro quale
 * boundary stanno. Stub sincroni che non rendono nulla.
 */
const { mockInvoked } = vi.hoisted(() => ({ mockInvoked: [] as string[] }));

vi.mock("./sections", () => ({
  AdminUserKpisSection: () => mockInvoked.push("utenti") && null,
  AdminDocumentKpisSection: () => mockInvoked.push("scontrini") && null,
  AdminTopMerchantsSection: () => mockInvoked.push("classifiche") && null,
  AdminTrialExpiringSection: () => mockInvoked.push("trial") && null,
  AdminPaidUsersSection: () => mockInvoked.push("paganti") && null,
  AdminRecentProfilesSection: () => mockInvoked.push("registrati") && null,
}));

import * as sections from "./sections";
import AdminPage from "./page";

const SECTION_NAMES = new Map<unknown, string>(
  Object.entries(sections).map(([name, component]) => [component, name]),
);

type FoundSection = {
  readonly name: string;
  readonly range: unknown;
  /** True se la sezione sta dentro un `<Suspense>` con un fallback vero. */
  readonly streamed: boolean;
};

type WalkableProps = {
  readonly children?: ReactNode;
  readonly range?: unknown;
  readonly fallback?: ReactNode;
};

/**
 * Raccoglie le sezioni presenti nell'albero restituito dalla pagina, dicendo
 * per ciascuna se è avvolta in un boundary Suspense con fallback.
 *
 * Assert strutturale e non visivo per necessità: una pagina che manda in
 * streaming sei blocchi non è osservabile da Testing Library, che renderizza
 * tutto in un colpo solo. L'albero però lo è, ed è esattamente il contratto —
 * "ogni lettura sta dietro al suo boundary" — che questo lavoro introduce.
 */
function collectSections(
  node: ReactNode,
  streamed = false,
  out: FoundSection[] = [],
): FoundSection[] {
  if (Array.isArray(node)) {
    for (const child of node) collectSections(child, streamed, out);
    return out;
  }
  if (!isValidElement(node)) return out;

  const element = node as ReactElement<WalkableProps>;
  const name = SECTION_NAMES.get(element.type);
  if (name) {
    out.push({ name, range: element.props.range, streamed });
    return out;
  }

  const insideSuspense =
    element.type === Suspense
      ? element.props.fallback !== undefined && element.props.fallback !== null
      : streamed;

  return collectSections(element.props.children, insideSuspense, out);
}

async function sectionsOf(range?: string): Promise<FoundSection[]> {
  const tree = await AdminPage({ searchParams: Promise.resolve({ range }) });
  return collectSections(tree);
}

describe("AdminPage — streaming", () => {
  it("monta tutte e sei le letture, ognuna dietro un Suspense con fallback", async () => {
    const found = await sectionsOf();

    expect(found).toHaveLength(6);
    expect(found.every((section) => section.streamed)).toBe(true);
  });

  it("non invoca nessuna lettura prima di restituire il guscio", async () => {
    // Il cuore del lavoro. `AdminPage` si risolve avendo prodotto l'albero ma
    // senza che una sola sezione — quindi una sola query — sia partita: sono i
    // boundary Suspense a invocarle, dopo che il guscio è già in volo. Se
    // qualcuno rimettesse un `await getAdmin…()` in cima alla pagina, questo
    // test diventerebbe rosso mentre tutti gli altri resterebbero verdi.
    mockInvoked.length = 0;

    const tree = await AdminPage({ searchParams: Promise.resolve({}) });

    expect(mockInvoked).toEqual([]);
    expect(isValidElement(tree)).toBe(true);
  });

  it("mette i KPI davanti alle tabelle: è anche l'ordine della coda", async () => {
    // Il pannello tiene una connessione per volta, la coda è FIFO e React
    // invoca i figli nell'ordine dell'albero: chi sta più in alto qui compare
    // prima in pagina.
    const found = await sectionsOf();

    expect(found.map((section) => section.name)).toEqual([
      "AdminUserKpisSection",
      "AdminDocumentKpisSection",
      "AdminTopMerchantsSection",
      "AdminTrialExpiringSection",
      "AdminPaidUsersSection",
      "AdminRecentProfilesSection",
    ]);
  });
});

describe("AdminPage — periodo", () => {
  it("apre su 7 giorni quando l'URL non ne specifica uno", async () => {
    const found = await sectionsOf();

    expect(found[0].range).toBe("7d");
  });

  it("onora un ?range= valido", async () => {
    const found = await sectionsOf("90d");

    expect(found[0].range).toBe("90d");
  });

  it("ricade sul default su un ?range= non valido, senza lanciare", async () => {
    const found = await sectionsOf("'; DROP TABLE profiles;--");

    expect(found[0].range).toBe("7d");
  });

  it("dà lo stesso periodo a tutte le sezioni che ne prendono uno", async () => {
    const found = await sectionsOf("30d");

    const conRange = found.filter((section) => section.range !== undefined);
    expect(conRange).toHaveLength(4);
    expect(conRange.every((section) => section.range === "30d")).toBe(true);
  });

  it("non passa un periodo alle due letture ancorate ad adesso", async () => {
    const found = await sectionsOf("30d");

    const senzaRange = found
      .filter((section) => section.range === undefined)
      .map((section) => section.name);
    expect(senzaRange).toEqual([
      "AdminTrialExpiringSection",
      "AdminPaidUsersSection",
    ]);
  });
});

describe("AdminPage — guscio", () => {
  it("rende subito il selettore di periodo, prima di qualunque dato", async () => {
    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "7 giorni" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "30 giorni" })).toBeInTheDocument();
  });

  it("segna come corrente il periodo aperto", async () => {
    render(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "7 giorni" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
