import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { searchReceipts } from "@/server/storico-actions";
import { StoricoClient } from "@/components/storico/storico-client";
import { PlanUnavailable } from "@/components/dashboard/plan-unavailable";
import { STORICO_PAGE_SIZE, type StatusFilter } from "@/types/storico";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { getPlanSafe } from "@/lib/plans";
import { defaultLast7DaysRomeRange } from "@/lib/storico-default-range";
import { fetchReceiptPrintHeader } from "@/lib/receipts/print-header";

const STATUS_VALUES = new Set<StatusFilter>(["ACCEPTED", "VOID_ACCEPTED", ""]);

function parseStatus(raw: string | undefined): StatusFilter {
  if (raw === undefined) return "ACCEPTED";
  return STATUS_VALUES.has(raw as StatusFilter)
    ? (raw as StatusFilter)
    : "ACCEPTED";
}

/**
 * Pre-fetch scontrini in base ai filtri URL (?dal=, ?al=, ?stato=).
 * Defaults: ultimi 7 giorni / ACCEPTED.
 * I filtri vengono passati come props iniziali al client per coerenza.
 */
export default async function StoricoPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    dal?: string;
    al?: string;
    stato?: string;
  }>;
}) {
  const status = await getOnboardingStatus();

  if (!status.businessId) {
    redirect("/onboarding");
  }

  const { dal, al, stato } = await searchParams;
  const { dateFrom: defaultFrom, dateTo: defaultTo } =
    defaultLast7DaysRomeRange();

  const dateFrom = dal ?? defaultFrom;
  const dateTo = al ?? defaultTo;
  const statusParam = parseStatus(stato);

  const [initialResult, user] = await Promise.all([
    searchReceipts(status.businessId, {
      dateFrom,
      dateTo,
      ...(statusParam ? { status: statusParam } : {}),
      page: 1,
      pageSize: STORICO_PAGE_SIZE,
    }),
    getAuthenticatedUser(),
  ]);
  // `getPlanSafe` e non `getPlan` (REVIEW.md #85): `searchReceipts` qui sopra
  // degrada già a `{ error, items: [], total: 0 }`, e un throw accanto
  // annullerebbe quella scelta mandando l'intera pagina al boundary.
  const [planResult, printHeader] = await Promise.all([
    getPlanSafe(user.id, "storicoPage"),
    fetchReceiptPrintHeader(status.businessId),
  ]);

  if (!planResult.ok) {
    return <PlanUnavailable message={planResult.error} />;
  }

  const planInfo = planResult.info;

  return (
    <StoricoClient
      businessId={status.businessId}
      initialItems={initialResult.items}
      initialTotal={initialResult.total}
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
      initialStatus={statusParam}
      plan={planInfo.plan}
      trialStartedAt={planInfo.trialStartedAt}
      printHeader={printHeader}
    />
  );
}
