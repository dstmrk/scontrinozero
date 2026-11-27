"use client";

import { useState, useTransition } from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  loadAdminDocumentKpis,
  loadAdminPaidUsers,
  loadAdminTopMerchants,
  loadAdminUserKpis,
} from "@/server/admin-actions";
import type { AnalyticsRange } from "@/server/analytics-helpers";
import { AdminAlert } from "./admin-alert";
import {
  AdminPaidUsersSkeleton,
  AdminPaidUsersTable,
  AdminTopMerchantsSkeleton,
  AdminTopMerchantsTables,
} from "./admin-directory-tables";
import { AdminDocumentKpiCards, AdminUserKpiCards } from "./admin-kpi-cards";
import { AdminKpiCardsSkeleton } from "./admin-skeletons";

/**
 * Le card di "Altre metriche": nessuna query finché non si preme "Carica".
 *
 * Client Component perché il click deve far partire UNA lettura (una server
 * action di `src/server/admin-actions.ts`) senza ridisegnare la pagina: un
 * link avrebbe rifatto anche le letture sempre visibili. Il periodo arriva
 * come prop dalla pagina, che monta questi componenti con `key={range}`:
 * cambiare periodo li riporta a "non caricato" invece di rifare la query da
 * sé.
 *
 * Il contenuto caricato riusa le card e le tabelle già esistenti: lo stesso
 * markup che il pannello rendeva lato server, ora reso dopo il click.
 */

const LOAD_FAILED =
  "Impossibile caricare questa sezione. Riprova tra qualche istante.";

type Loaded<T> = T | { error: string };

interface OnDemandProps<T> {
  readonly title: string;
  readonly description: string;
  readonly load: () => Promise<Loaded<T>>;
  readonly pending: React.ReactNode;
  readonly render: (data: T) => React.ReactNode;
  /** Classi della cella di griglia una volta caricata (le tabelle si allargano). */
  readonly loadedClassName?: string;
}

function OnDemand<T extends object>({
  title,
  description,
  load,
  pending,
  render,
  loadedClassName,
}: OnDemandProps<T>) {
  const [result, setResult] = useState<Loaded<T> | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      // L'action degrada già a `{ error }` (regola 19); il catch copre ciò
      // che succede prima di arrivarci — rete caduta, deploy nel mezzo.
      try {
        setResult(await load());
      } catch {
        setResult({ error: LOAD_FAILED });
      }
    });
  };

  if (isPending) return <div className={loadedClassName}>{pending}</div>;

  if (result && !("error" in result)) {
    return <div className={loadedClassName}>{render(result)}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {result ? (
          <AdminAlert message={result.error} />
        ) : (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
        <Button variant="outline" size="sm" onClick={run}>
          <RotateCw aria-hidden="true" />
          {result ? "Riprova" : "Carica"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface RangeProps {
  readonly range: AnalyticsRange;
}

export function AdminUserKpisOnDemand({ range }: RangeProps) {
  return (
    <OnDemand
      title="Nuovi utenti"
      description="Registrati nel periodo e totale, con l'andamento cumulato."
      load={() => loadAdminUserKpis(range)}
      pending={
        <AdminKpiCardsSkeleton count={1} sparklines={1} label="nuovi utenti" />
      }
      render={({ kpis }) => <AdminUserKpiCards kpis={kpis} />}
    />
  );
}

export function AdminDocumentKpisOnDemand({ range }: RangeProps) {
  // Due card: una volta caricate prendono due celle e si affiancano.
  const wide = "grid gap-3 sm:col-span-2 sm:grid-cols-2";
  return (
    <OnDemand
      title="Scontrini e incasso"
      description="Scontrini accettati e incasso del periodo, con l'andamento giornaliero."
      load={() => loadAdminDocumentKpis(range)}
      pending={
        <AdminKpiCardsSkeleton
          count={2}
          sparklines={2}
          label="scontrini e incasso"
        />
      }
      render={({ kpis }) => <AdminDocumentKpiCards kpis={kpis} />}
      loadedClassName={wide}
    />
  );
}

export function AdminPaidUsersOnDemand() {
  return (
    <OnDemand
      title="Utenti paganti"
      description="Chi paga oggi, con piano e inizio del periodo corrente."
      load={() => loadAdminPaidUsers()}
      pending={<AdminPaidUsersSkeleton />}
      render={({ rows }) => <AdminPaidUsersTable rows={rows} />}
      loadedClassName="col-span-full"
    />
  );
}

export function AdminTopMerchantsOnDemand({ range }: RangeProps) {
  return (
    <OnDemand
      title="Top esercenti"
      description="Classifiche per scontrini e per incasso nel periodo."
      load={() => loadAdminTopMerchants(range)}
      pending={<AdminTopMerchantsSkeleton />}
      render={({ merchants }) => (
        <AdminTopMerchantsTables merchants={merchants} />
      )}
      loadedClassName="col-span-full"
    />
  );
}
