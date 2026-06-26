"use client";

import Link from "next/link";
import { Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BILLING_SETTINGS_HREF,
  canUsePro,
  type Plan,
} from "@/lib/plans-shared";

interface ExportCsvButtonProps {
  readonly plan: Plan;
  /**
   * Server prop da `getPlan()`: un trial attivo è trattato come Pro (assaggio
   * export CSV durante la prova). Omesso/null → il trial resta gated.
   */
  readonly trialStartedAt?: Date | null;
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
  if (canUsePro(props.plan, null, props.trialStartedAt)) {
    return (
      <Button asChild variant="outline">
        <a href={buildExportUrl(props)} download>
          <Download className="size-4" aria-hidden />
          Esporta CSV
        </a>
      </Button>
    );
  }

  // Non-Pro (starter/trial): segnale visivo "Pro" + dialog esplicativo invece
  // del redirect silenzioso alle impostazioni.
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label="Esporta CSV — funzionalità Pro">
          <Download className="size-4" aria-hidden />
          Esporta CSV
          <Badge variant="secondary">Pro</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" aria-hidden />
            Esportazione CSV è una funzionalità Pro
          </DialogTitle>
          <DialogDescription>
            L&apos;export dello storico in formato CSV è incluso nel piano Pro.
            Passa a Pro per scaricare i tuoi corrispettivi e usarli in
            contabilità o nei tuoi report.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Annulla</Button>
          </DialogClose>
          <Button asChild>
            <Link href={BILLING_SETTINGS_HREF}>Passa a Pro</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
