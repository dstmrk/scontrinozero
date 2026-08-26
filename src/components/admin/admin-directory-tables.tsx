import { AdminTable, type AdminTableColumn } from "./admin-table";
import { formatCurrency, formatDate } from "@/lib/utils";
import type {
  AdminDirectory,
  AdminMerchant,
  AdminPaidUserRow,
  AdminProfileRow,
  AdminTrialRow,
} from "@/server/admin-directory";

/** Segnaposto per un campo assente: una cella vuota sembrerebbe un bug. */
const DASH = "—";

const countFormatter = new Intl.NumberFormat("it-IT");

function text(value: string | null): string {
  return value ?? DASH;
}

function merchantColumns(): ReadonlyArray<AdminTableColumn<AdminMerchant>> {
  return [
    { header: "Esercente", cell: (m) => text(m.businessName) },
    { header: "Titolare", cell: (m) => text(m.ownerName) },
    { header: "Luogo", cell: (m) => text(m.location) },
    { header: "Email", cell: (m) => m.email },
    {
      header: "Scontrini",
      cell: (m) => countFormatter.format(m.receipts),
      align: "right",
    },
    {
      header: "Incasso",
      cell: (m) => formatCurrency(m.revenueCents / 100),
      align: "right",
    },
  ];
}

const PROFILE_COLUMNS: ReadonlyArray<AdminTableColumn<AdminProfileRow>> = [
  { header: "Nome", cell: (p) => text(p.name) },
  { header: "Email", cell: (p) => p.email },
  {
    header: "Registrato il",
    cell: (p) => formatDate(p.createdAt),
    align: "right",
  },
];

const TRIAL_COLUMNS: ReadonlyArray<AdminTableColumn<AdminTrialRow>> = [
  { header: "Nome", cell: (t) => text(t.name) },
  { header: "Email", cell: (t) => t.email },
  {
    header: "Scade il",
    cell: (t) => formatDate(t.trialExpiresAt),
    align: "right",
  },
];

const PAID_COLUMNS: ReadonlyArray<AdminTableColumn<AdminPaidUserRow>> = [
  { header: "Nome", cell: (u) => text(u.name) },
  { header: "Email", cell: (u) => u.email },
  { header: "Piano", cell: (u) => u.plan },
  {
    header: "Paga dal",
    cell: (u) => (u.planActivatedAt ? formatDate(u.planActivatedAt) : DASH),
    align: "right",
  },
];

interface AdminDirectoryTablesProps {
  readonly directory: AdminDirectory;
}

/**
 * Le cinque tabelle del pannello operatore.
 *
 * Le due classifiche esercenti sono affiancate su schermo largo perché si
 * leggono a confronto: chi emette di più non è sempre chi incassa di più.
 */
export function AdminDirectoryTables({ directory }: AdminDirectoryTablesProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <AdminTable
          title="Top esercenti per scontrini"
          description="Nel periodo selezionato, solo scontrini accettati."
          columns={merchantColumns()}
          rows={directory.topByReceipts}
          rowKey={(m) => m.businessId}
          empty="Nessuno scontrino emesso nel periodo."
        />
        <AdminTable
          title="Top esercenti per incasso"
          description="Nel periodo selezionato, solo scontrini accettati."
          columns={merchantColumns()}
          rows={directory.topByRevenue}
          rowKey={(m) => m.businessId}
          empty="Nessuno scontrino emesso nel periodo."
        />
      </div>

      <AdminTable
        title="Trial in scadenza"
        description="Finestra fissa di ±7 giorni da oggi, indipendente dal periodo selezionato. Scadenza calcolata includendo il bonus referral."
        columns={TRIAL_COLUMNS}
        rows={directory.trialExpiring}
        rowKey={(t) => t.email}
        empty="Nessun trial in scadenza nei prossimi 7 giorni."
      />

      <AdminTable
        title="Utenti paganti"
        description="Piani Starter e Pro attivi. «Paga dal» è l'inizio del periodo di fatturazione corrente, non il primo pagamento in assoluto."
        columns={PAID_COLUMNS}
        rows={directory.paidUsers}
        rowKey={(u) => u.email}
        empty="Nessun utente su un piano a pagamento."
      />

      <AdminTable
        title="Registrati di recente"
        description="Nel periodo selezionato, dal più recente."
        columns={PROFILE_COLUMNS}
        rows={directory.recentProfiles}
        rowKey={(p) => p.email}
        empty="Nessuna registrazione nel periodo."
      />
    </div>
  );
}
