import { AdminTableSkeleton } from "./admin-skeletons";
import { AdminTable, type AdminTableColumn } from "./admin-table";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { RecordedVerifyOutcome } from "@/lib/ade/verify-outcome";
import type {
  AdminMerchant,
  AdminPaidUserRow,
  AdminProfileRow,
  AdminStalledOnboarding,
  AdminStalledOnboardingRow,
  AdminTopMerchants,
  AdminTrialRow,
} from "@/server/admin-directory";

/**
 * Le cinque tabelle del pannello operatore, una per lettura.
 *
 * Ogni tabella esporta anche il **proprio skeleton**, che vive qui accanto e
 * non in `admin-skeletons.tsx`: titolo e descrizione sono gli stessi del
 * componente vero, e tenerli in due file li farebbe divergere al primo
 * ritocco. Il segnaposto mostra le intestazioni reali, così l'operatore sa
 * cosa sta arrivando mentre la query è in coda.
 */

/** Segnaposto per un campo assente: una cella vuota sembrerebbe un bug. */
const DASH = "—";

const countFormatter = new Intl.NumberFormat("it-IT");

function text(value: string | null): string {
  return value ?? DASH;
}

/**
 * Intestazioni delle tabelle, in un posto solo perché le leggono sia il
 * componente sia il suo skeleton.
 */
const HEADINGS = {
  byReceipts: {
    title: "Top esercenti per scontrini",
    description: "Nel periodo selezionato, solo scontrini accettati.",
  },
  byRevenue: {
    title: "Top esercenti per incasso",
    description: "Nel periodo selezionato, solo scontrini accettati.",
  },
  trials: {
    title: "Trial in scadenza",
    description:
      "Finestra fissa di ±7 giorni da oggi, indipendente dal periodo selezionato. Scadenza calcolata includendo il bonus referral.",
  },
  paid: {
    title: "Utenti paganti",
    description:
      "Piani Starter e Pro attivi. «Paga dal» è l'inizio del periodo di fatturazione corrente, non il primo pagamento in assoluto.",
  },
  profiles: {
    title: "Registrati di recente",
    description: "Nel periodo selezionato, dal più recente.",
  },
  stalled: {
    title: "Onboarding fermi",
    description:
      "Credenziali AdE salvate ma mai verificate, dal più vecchio. Finestra ancorata a oggi, indipendente dal periodo selezionato.",
  },
} as const;

/**
 * Etichette degli esiti di verifica (REVIEW.md #107).
 *
 * `Record<RecordedVerifyOutcome, string>` e non un indice largo: così un valore
 * nuovo nel vocabolario non compila finché qualcuno non decide come si chiama
 * in pagina. Un esito senza etichetta è un esito che l'operatore non sa
 * leggere, cioè attribuzione buttata via.
 */
const OUTCOME_LABELS: Record<RecordedVerifyOutcome, string> = {
  success: "Verificato",
  auth_error: "Credenziali rifiutate",
  password_expired: "Password scaduta",
  utenza_selection_required: "Fermo sulla scelta P.IVA",
  utenza_not_available: "Utenza non più disponibile",
  utenza_locked: "P.IVA già collegata",
  no_partita_iva: "Utenza senza P.IVA",
  reauth_required: "Ricollegamento CIE richiesto",
  piva_mismatch: "P.IVA diversa da quella registrata",
  piva_conflict: "P.IVA già su un altro account",
  identity_unconfirmed: "Identità non confermata",
  incomplete_credentials: "Credenziali incomplete",
  invalid_utenza_piva: "P.IVA malformata",
  credentials_changed: "Credenziali cambiate durante la verifica",
  finalize_failed: "Salvataggio fallito dopo la verifica",
  transient: "Guasto temporaneo",
  failure: "Errore non classificato",
  unknown_pre_tracking: "Ignoto (precedente al tracciamento)",
};

/**
 * Etichetta di un esito. Il `null` NON è un dato mancante: è la persona che ha
 * salvato le credenziali e non ha mai premuto Verifica, cioè il caso che prima
 * di questa tabella era indistinguibile da un errore di login.
 */
function outcomeLabel(outcome: string | null): string {
  if (outcome === null) return "Mai tentato";
  return OUTCOME_LABELS[outcome as RecordedVerifyOutcome] ?? outcome;
}

const STALLED_COLUMNS: ReadonlyArray<
  AdminTableColumn<AdminStalledOnboardingRow>
> = [
  { header: "Nome", cell: (r) => text(r.name) },
  { header: "Email", cell: (r) => r.email },
  { header: "Accesso", cell: (r) => r.loginMethod },
  { header: "Ultimo esito", cell: (r) => outcomeLabel(r.outcome) },
  {
    header: "Tentativi",
    cell: (r) => countFormatter.format(r.attempts),
    align: "right",
  },
  {
    header: "Fermo dal",
    cell: (r) => formatDate(r.createdAt),
    align: "right",
  },
];

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

/** Griglia delle due classifiche: si leggono a confronto su schermo largo. */
function MerchantsGrid({ children }: { readonly children: React.ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-2">{children}</div>;
}

interface AdminTopMerchantsTablesProps {
  readonly merchants: AdminTopMerchants;
}

/**
 * Le due classifiche esercenti, affiancate su schermo largo perché si leggono
 * a confronto: chi emette di più non è sempre chi incassa di più. Vengono
 * dalla stessa query, quindi condividono un solo boundary Suspense.
 */
export function AdminTopMerchantsTables({
  merchants,
}: AdminTopMerchantsTablesProps) {
  return (
    <MerchantsGrid>
      <AdminTable
        {...HEADINGS.byReceipts}
        columns={merchantColumns()}
        rows={merchants.byReceipts}
        rowKey={(m) => m.businessId}
        empty="Nessuno scontrino emesso nel periodo."
      />
      <AdminTable
        {...HEADINGS.byRevenue}
        columns={merchantColumns()}
        rows={merchants.byRevenue}
        rowKey={(m) => m.businessId}
        empty="Nessuno scontrino emesso nel periodo."
      />
    </MerchantsGrid>
  );
}

export function AdminTopMerchantsSkeleton() {
  return (
    <MerchantsGrid>
      <AdminTableSkeleton {...HEADINGS.byReceipts} />
      <AdminTableSkeleton {...HEADINGS.byRevenue} />
    </MerchantsGrid>
  );
}

interface AdminTrialExpiringTableProps {
  readonly rows: readonly AdminTrialRow[];
}

export function AdminTrialExpiringTable({
  rows,
}: AdminTrialExpiringTableProps) {
  return (
    <AdminTable
      {...HEADINGS.trials}
      columns={TRIAL_COLUMNS}
      rows={rows}
      rowKey={(t) => t.email}
      empty="Nessun trial in scadenza nei prossimi 7 giorni."
    />
  );
}

export function AdminTrialExpiringSkeleton() {
  return <AdminTableSkeleton {...HEADINGS.trials} />;
}

interface AdminPaidUsersTableProps {
  readonly rows: readonly AdminPaidUserRow[];
}

export function AdminPaidUsersTable({ rows }: AdminPaidUsersTableProps) {
  return (
    <AdminTable
      {...HEADINGS.paid}
      columns={PAID_COLUMNS}
      rows={rows}
      rowKey={(u) => u.email}
      empty="Nessun utente su un piano a pagamento."
    />
  );
}

export function AdminPaidUsersSkeleton() {
  return <AdminTableSkeleton {...HEADINGS.paid} />;
}

interface AdminRecentProfilesTableProps {
  readonly rows: readonly AdminProfileRow[];
}

export function AdminRecentProfilesTable({
  rows,
}: AdminRecentProfilesTableProps) {
  return (
    <AdminTable
      {...HEADINGS.profiles}
      columns={PROFILE_COLUMNS}
      rows={rows}
      rowKey={(p) => p.email}
      empty="Nessuna registrazione nel periodo."
    />
  );
}

export function AdminRecentProfilesSkeleton() {
  return <AdminTableSkeleton {...HEADINGS.profiles} />;
}

interface AdminStalledOnboardingTableProps {
  readonly stalled: AdminStalledOnboarding;
}

/**
 * Onboarding fermi, con il conteggio per fascia d'età sopra la tabella.
 *
 * Il conteggio non è decorazione: le righe sono tagliate a 50, i totali no, e
 * «fermo da tre giorni» e «fermo da quattro mesi» sono due problemi diversi che
 * l'esito da solo non separa.
 */
export function AdminStalledOnboardingTable({
  stalled,
}: AdminStalledOnboardingTableProps) {
  const { counts } = stalled;
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {countFormatter.format(counts.total)} fermi in totale —{" "}
        {countFormatter.format(counts.recent)} da meno di 7 giorni,{" "}
        {countFormatter.format(counts.weeks)} da 7 a 30,{" "}
        {countFormatter.format(counts.stale)} da oltre 30.
      </p>
      <AdminTable
        {...HEADINGS.stalled}
        columns={STALLED_COLUMNS}
        rows={stalled.rows}
        rowKey={(r) => r.email}
        empty="Nessun onboarding fermo."
      />
    </div>
  );
}

export function AdminStalledOnboardingSkeleton() {
  return <AdminTableSkeleton {...HEADINGS.stalled} />;
}
