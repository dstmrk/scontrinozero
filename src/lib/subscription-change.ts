export type SubscriptionPlan = "starter" | "pro" | "team";
export type SubscriptionInterval = "month" | "year";

export type PlanChoice = Readonly<{
  plan: SubscriptionPlan;
  interval: SubscriptionInterval;
}>;

/** Stato della riga `subscriptions` prima della sync di un evento Stripe. */
export type PreviousSubscriptionState = Readonly<{
  status: string | null;
  priceId: string | null;
  cancelAtPeriodEnd: boolean;
}>;

/** Stato che l'evento Stripe sta per scrivere sulla riga. */
export type NextSubscriptionState = Readonly<{
  status: string;
  priceId: string;
  cancelAtPeriodEnd: boolean;
}>;

export type SubscriptionChange =
  | Readonly<{ kind: "started"; to: PlanChoice }>
  | Readonly<{
      kind: "changed";
      from: PlanChoice | null;
      to: PlanChoice;
    }>
  | Readonly<{ kind: "cancel_scheduled"; to: PlanChoice }>
  | Readonly<{ kind: "ended"; to: PlanChoice }>;

// Stati in cui l'esercente ha un abbonamento in corso. `past_due` ci sta di
// proposito: un pagamento rientrato (past_due → active) non è una nuova
// sottoscrizione. `incomplete` no: il passaggio incomplete → active (3DS
// completato dopo il checkout) lo è.
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Classifica la transizione che una sync Stripe produce sulla riga, a
 * prescindere da quale evento l'ha portata: `checkout.session.completed` e
 * `customer.subscription.updated` di una nuova sottoscrizione arrivano
 * ravvicinati e in ordine non garantito, quindi il tipo di evento non
 * distingue "nuova" da "già vista" — lo fa il confronto tra gli stati.
 *
 * Funzione pura: `resolve` traduce un priceId nel piano (iniettato per non
 * legare questo modulo alla config Stripe). Ritorna `null` quando non c'è
 * nulla da notificare (cambio di solo stato, rinnovo, evento ripetuto).
 */
export function classifySubscriptionChange(
  prev: PreviousSubscriptionState,
  next: NextSubscriptionState,
  resolve: (priceId: string) => PlanChoice | null,
): SubscriptionChange | null {
  if (!LIVE_STATUSES.has(next.status)) return null;

  const to = resolve(next.priceId);
  if (!to) return null;

  if (!prev.status || !LIVE_STATUSES.has(prev.status)) {
    return { kind: "started", to };
  }
  if (prev.priceId && prev.priceId !== next.priceId) {
    return {
      kind: "changed",
      from: resolve(prev.priceId),
      to,
    };
  }
  if (!prev.cancelAtPeriodEnd && next.cancelAtPeriodEnd) {
    return { kind: "cancel_scheduled", to };
  }
  return null;
}

/**
 * Il cambio porta via il piano Team (issue #1099): da Team a un altro piano,
 * o la fine di un abbonamento Team. È il segnale per avvisare i
 * collaboratori, non la prova che restino fermi: lo decide il piano effettivo
 * del titolare dopo il cambio, che con una prova ancora in corso li ammette.
 */
export function leavesTeam(change: SubscriptionChange): boolean {
  if (change.kind === "changed") {
    return change.from?.plan === "team" && change.to.plan !== "team";
  }
  return change.kind === "ended" && change.to.plan === "team";
}
