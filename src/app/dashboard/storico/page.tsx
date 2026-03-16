import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { searchReceipts } from "@/server/storico-actions";
import { StoricoClient } from "@/components/storico/storico-client";
import type { StatusFilter } from "@/types/storico";

const STATUS_VALUES: StatusFilter[] = ["ACCEPTED", "VOID_ACCEPTED", ""];

function parseStatus(raw: string | undefined): StatusFilter {
  if (raw === undefined) return "ACCEPTED";
  return STATUS_VALUES.includes(raw as StatusFilter)
    ? (raw as StatusFilter)
    : "ACCEPTED";
}

/**
 * Pre-fetch scontrini in base ai filtri URL (?dal=, ?al=, ?stato=).
 * Defaults: oggi / oggi / ACCEPTED.
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
  const todayStr = new Date().toISOString().split("T")[0];

  const dateFrom = dal ?? todayStr;
  const dateTo = al ?? todayStr;
  const statusParam = parseStatus(stato);

  const initialData = await searchReceipts(status.businessId, {
    dateFrom,
    dateTo,
    ...(statusParam ? { status: statusParam } : {}),
  });

  return (
    <StoricoClient
      businessId={status.businessId}
      initialData={initialData}
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
      initialStatus={statusParam}
    />
  );
}
