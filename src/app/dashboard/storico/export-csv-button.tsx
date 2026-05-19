import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canUsePro, type Plan } from "@/lib/plans-shared";

interface ExportCsvButtonProps {
  readonly plan: Plan;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly status: "ACCEPTED" | "VOID_ACCEPTED" | null;
}

function buildExportUrl(props: ExportCsvButtonProps): string {
  const params = new URLSearchParams();
  params.set("from", props.dateFrom);
  params.set("to", props.dateTo);
  if (props.status) params.set("status", props.status);
  return `/api/export/receipts?${params.toString()}`;
}

export function ExportCsvButton(props: ExportCsvButtonProps) {
  if (canUsePro(props.plan)) {
    return (
      <Button asChild variant="outline">
        <a href={buildExportUrl(props)} download>
          <Download className="size-4" aria-hidden />
          Esporta CSV
        </a>
      </Button>
    );
  }

  return (
    <Button asChild variant="outline">
      <Link
        href="/dashboard/settings#billing"
        title="Esportazione CSV disponibile sul piano Pro"
      >
        <Download className="size-4" aria-hidden />
        Esporta CSV
      </Link>
    </Button>
  );
}
