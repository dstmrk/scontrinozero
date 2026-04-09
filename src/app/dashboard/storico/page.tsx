import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { searchReceipts } from "@/server/storico-actions";
import { StoricoClient } from "@/components/storico/storico-client";
import { STORICO_PAGE_SIZE, type StatusFilter } from "@/types/storico";

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
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6); // 6 giorni fa + oggi = 7 giorni
  const todayStr = today.toISOString().split("T")[0];
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const dateFrom = dal ?? sevenDaysAgoStr;
  const dateTo = al ?? todayStr;
  const statusParam = parseStatus(stato);

  const initialResult = await searchReceipts(status.businessId, {
    dateFrom,
    dateTo,
    ...(statusParam ? { status: statusParam } : {}),
    page: 1,
    pageSize: STORICO_PAGE_SIZE,
  });

  return (
    <StoricoClient
      businessId={status.businessId}
      initialItems={initialResult.items}
      initialTotal={initialResult.total}
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
      initialStatus={statusParam}
    />
  );
}
