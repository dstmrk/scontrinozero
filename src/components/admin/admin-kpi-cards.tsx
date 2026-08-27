import { KpiCard } from "@/components/kpi-card";
import { formatCurrency } from "@/lib/utils";
import type { AdminDocumentKpis, AdminUserKpis } from "@/server/admin-metrics";
import { AdminSparkline } from "./admin-sparkline";

// Module-scope: costruire un Intl.NumberFormat è costoso e le opzioni sono
// costanti (stesso motivo di `src/components/analytics/kpi-cards.tsx`).
const countFormatter = new Intl.NumberFormat("it-IT");
const percentFormatter = new Intl.NumberFormat("it-IT", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Le sei card del pannello operatore, in **due gruppi da tre**.
 *
 * Il taglio segue la query che le alimenta, non l'estetica: le tre card utenti
 * vengono da `profiles`, le tre scontrini da `commercial_documents`. Ognuno dei
 * due gruppi sta dietro al proprio boundary Suspense, così le card utenti
 * compaiono senza aspettare la scansione dello storico scontrini.
 *
 * Entrambi rendono un **frammento**, non un contenitore: la griglia è della
 * pagina, e `<Suspense>` non produce un nodo DOM, quindi le card restano figlie
 * dirette della griglia sia da skeleton sia da contenuto.
 *
 * L'ordine visivo è cambiato con la separazione — prima le card si alternavano
 * (utenti, scontrini, incasso, trial…), ora ogni riga è un tema solo. È un
 * effetto del taglio, ma anche una riga che si legge meglio.
 *
 * Ogni card del periodo porta il totale storico come footnote: sono le due
 * domande che si fanno insieme ("quanti nuovi utenti questo mese" / "quanti in
 * tutto") e separarle in due griglie raddoppiava le card senza aggiungere
 * informazione.
 */

interface AdminUserKpiCardsProps {
  readonly kpis: AdminUserKpis;
}

export function AdminUserKpiCards({ kpis }: AdminUserKpiCardsProps) {
  return (
    <>
      <KpiCard
        title="Nuovi utenti"
        value={countFormatter.format(kpis.usersInRange)}
        footnote={`${countFormatter.format(kpis.usersTotal)} in totale`}
      >
        <AdminSparkline
          points={kpis.usersSparkline}
          label="Andamento nuovi utenti"
        />
      </KpiCard>
      <KpiCard
        title="Trial attivi"
        value={countFormatter.format(kpis.trialsActive)}
        footnote="Bonus referral incluso"
      />
      <KpiCard
        title="Conversione trial"
        value={percentFormatter.format(kpis.trialConversionRate)}
        footnote="Trial partiti negli ultimi 90 giorni"
      />
    </>
  );
}

interface AdminDocumentKpiCardsProps {
  readonly kpis: AdminDocumentKpis;
}

export function AdminDocumentKpiCards({ kpis }: AdminDocumentKpiCardsProps) {
  return (
    <>
      <KpiCard
        title="Scontrini"
        value={countFormatter.format(kpis.receiptsInRange)}
        footnote={`${countFormatter.format(kpis.receiptsTotal)} in totale`}
      >
        <AdminSparkline
          points={kpis.receiptsSparkline}
          label="Andamento scontrini"
        />
      </KpiCard>
      <KpiCard
        title="Incasso"
        value={formatCurrency(kpis.revenueCentsInRange / 100)}
        footnote={`${formatCurrency(kpis.revenueCentsTotal / 100)} in totale`}
      >
        <AdminSparkline
          points={kpis.revenueSparkline}
          label="Andamento incasso"
        />
      </KpiCard>
      <KpiCard
        title="Annullati"
        value={countFormatter.format(kpis.voidedInRange)}
        footnote="Scontrini annullati nel periodo"
      />
    </>
  );
}
