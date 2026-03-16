import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/server/onboarding-actions";
import { searchReceipts } from "@/server/storico-actions";
import { StoricoClient } from "@/components/storico/storico-client";

const STATUS_VALUES = ["ACCEPTED", "VOID_ACCEPTED", ""] as const;
type StatusParam = (typeof STATUS_VALUES)[number];

function parseStatus(raw: string | undefined): StatusParam {
  if (raw === undefined) return "ACCEPTED";
  return STATUS_VALUES.includes(raw as StatusParam)
    ? (raw as StatusParam)
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
