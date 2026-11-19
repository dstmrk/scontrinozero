"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, ShoppingCart, X } from "lucide-react";
import { useCartIdempotencyKey } from "@/hooks/use-cart-idempotency-key";
import { useCassa } from "@/hooks/use-cassa";
import { VAT_CODES, VatCode } from "@/types/cassa";
import type { CartLine, PaymentMethod } from "@/types/cassa";
import type { CatalogItem } from "@/types/catalogo";
import type { ReceiptPrintProfile } from "@/lib/receipts/print-profile";
import {
  splitCashElectronic,
  toPaymentEntries,
  type PaymentInput,
} from "@/lib/receipts/payment-input";
import type { PaymentEntry } from "@/lib/receipts/public-request";
import {
  NumericKeypad,
  type NumericKeypadHandle,
} from "@/components/cassa/numeric-keypad";
import { VatSelector } from "@/components/cassa/vat-selector";
import { CartLineItem } from "@/components/cassa/cart-line-item";
import { CatalogGrid } from "@/components/cassa/catalog-grid";
import { ReceiptSummary } from "@/components/cassa/receipt-summary";
import { ReceiptSuccess } from "@/components/cassa/receipt-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { track, UMAMI_EVENTS } from "@/lib/umami";
import { emitReceipt } from "@/server/receipt-actions";
import { ChangeAdePasswordDialog } from "@/components/ade/change-ade-password-dialog";
import { AdeReauthBanner } from "@/components/ade/ade-reauth-banner";
import { TrialExpiredMessage } from "@/components/billing/trial-expired-message";
import { TRIAL_EXPIRED_MESSAGE } from "@/lib/plans-shared";
import { useIsCollaborator } from "@/components/dashboard/member-role";

type Step = "cart" | "add-item" | "summary" | "success";

const FALLBACK_VAT: VatCode = "22";

type CatalogSelection = Pick<
  CatalogItem,
  "description" | "defaultPrice" | "defaultVatCode"
>;

/**
 * Il prodotto che la pagina Catalogo passa in query string, o `null` se i
 * parametri mancano o l'IVA non è un codice noto. `description`+`price`
 * vince su `prefillDescription` (prodotto senza prezzo).
 */
function catalogItemFromParams(params: {
  get(name: string): string | null;
}): CatalogSelection | null {
  const isVat = (v: string | null): v is VatCode =>
    v !== null && VAT_CODES.includes(v as VatCode);

  const description = params.get("description");
  const price = params.get("price");
  const vatCode = params.get("vatCode");
  if (description && price && isVat(vatCode)) {
    return { description, defaultPrice: price, defaultVatCode: vatCode };
  }
  const prefillDescription = params.get("prefillDescription");
  const prefillVatCode = params.get("prefillVatCode");
  if (prefillDescription && isVat(prefillVatCode)) {
    return {
      description: prefillDescription,
      defaultPrice: null,
      defaultVatCode: prefillVatCode,
    };
  }
  return null;
}

interface CassaClientProps {
  readonly businessId: string;
  readonly preferredVatCode?: VatCode;
  /**
   * Intestazione esercente e messaggio di cortesia per la stampa termica;
   * `null` se l'intestazione e' incompleta (il bottone ripiega sul PDF).
   */
  readonly printProfile: ReceiptPrintProfile | null;
  /**
   * Gate di piano per gli sconti (Pro), risolto lato server. Quando `false`
   * l'affordance non compare in cassa: il gate autoritativo resta comunque
   * `discountGateError` nella server action.
   */
  readonly discountsUnlocked?: boolean;
  /**
   * Prodotti del catalogo mostrati come tile nello step carrello. Vuoto o
   * assente = la griglia non compare e la cassa resta quella a importo libero.
   */
  readonly catalogItems?: readonly CatalogItem[];
}

const NO_CATALOG: readonly CatalogItem[] = [];

export function CassaClient({
  businessId,
  preferredVatCode,
  printProfile,
  discountsUnlocked = false,
  catalogItems = NO_CATALOG,
}: CassaClientProps) {
  const defaultVat = preferredVatCode ?? FALLBACK_VAT;
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    lines,
    paymentMethod,
    addLine,
    updateLine,
    removeLine,
    clearCart,
    setPaymentMethod,
    totalCents,
    total,
  } = useCassa();

  // Chiave di idempotenza stabile per carrello (PR #904, slice 3): un
  // retry sullo stesso carrello riusa la stessa chiave e collide sul vincolo
  // UNIQUE, che è l'unico ingresso della stale-recovery. Prima la cassa ne
  // coniava una nuova a ogni submit e ogni retry lasciava indietro una riga
  // PENDING che nessuno avrebbe più riconciliato.
  const idempotency = useCartIdempotencyKey();

  const [step, setStep] = useState<Step>("cart");
  // id dell'articolo in modifica (null = nuova aggiunta)
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lotteryCode, setLotteryCode] = useState("");
  // Sconto a pagare in centesimi interi (regola 17). Vive qui e non in
  // `useCassa` perche' non e' stato del carrello: e' una scelta della fase di
  // pagamento, e si azzera con lo scontrino, non con le righe.
  const [globalDiscountCents, setGlobalDiscountCents] = useState(0);
  // Quota in contanti di un pagamento misto, o `null` quando la modalità è
  // una sola. Un numero solo e non due: la quota elettronica è sempre il
  // resto dell'incassato, così non può esistere una ripartizione che non
  // quadra con la voce #5 (vedi `PaymentSplit`). Vive qui accanto all'abbuono
  // per la stessa ragione — è una scelta della fase di pagamento, non del
  // carrello, e si azzera con lo scontrino.
  const [splitCashCents, setSplitCashCents] = useState<number | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  // Cambio password e verifica delle credenziali sono del titolare (issue
  // #1099): al collaboratore il server dice già di avvisarlo.
  const isCollaborator = useIsCollaborator();
  const [successData, setSuccessData] = useState<{
    documentId?: string;
    adeProgressive?: string;
    adeTransactionId?: string;
    adeRegisteredAt?: string;
    /** Righe emesse, congelate PRIMA di svuotare il carrello. */
    lines: CartLine[];
    paymentMethod: PaymentMethod;
    payments: readonly PaymentEntry[] | null;
    lotteryCode: string | null;
    globalDiscountCents: number;
  } | null>(null);

  // Stato form aggiungi articolo
  const [description, setDescription] = useState("");
  const [amountCents, setAmountCents] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [vatCode, setVatCode] = useState<VatCode>(defaultVat);
  // Sconto della riga in lavorazione, in centesimi interi (regola 17).
  const [lineDiscountCents, setLineDiscountCents] = useState(0);
  const [lineDiscountOpen, setLineDiscountOpen] = useState(false);

  // Ref guard: evita doppia esecuzione in React Strict Mode
  const catalogParamConsumed = useRef(false);
  const amountKeypadRef = useRef<NumericKeypadHandle>(null);

  const parsedAmount = amountCents / 100;
  const canAdd = amountCents > 0;

  const mutation = useMutation({
    mutationFn: emitReceipt,
    onSuccess: (result) => {
      if (result.error || result.reauthRequired) {
        // reauthRequired: sessione CIE scaduta, nessuno scontrino emesso. Non
        // svuotare il carrello: l'utente si ricollega e riprova. Gestito nel
        // render via mutation.data.
        return;
      }
      // ⚠️ Ordine: le righe vanno congelate PRIMA di `clearCart()`, altrimenti
      // la schermata di successo non ha nulla da stampare (il carrello è già
      // vuoto quando ReceiptSuccess monta).
      const emittedLines = lines;
      const emittedPaymentMethod = paymentMethod;
      const emittedPayments = toPaymentEntries(buildPayments());
      const emittedLotteryCode = lotteryCode || null;
      const emittedDiscountCents = globalDiscountCents;

      clearCart();
      setGlobalDiscountCents(0);
      setSplitCashCents(null);
      // Rotazione obbligatoria: senza, due vendite identiche di fila — due
      // caffè — riuserebbero la stessa chiave e la seconda riceverebbe il
      // successo idempotente della prima senza emettere nulla.
      idempotency.rotate();
      track(UMAMI_EVENTS.receiptEmitted);
      setSuccessData({
        documentId: result.documentId,
        adeProgressive: result.adeProgressive,
        adeTransactionId: result.adeTransactionId,
        adeRegisteredAt: result.adeRegisteredAt,
        lines: emittedLines,
        paymentMethod: emittedPaymentMethod,
        payments: emittedPayments,
        lotteryCode: emittedLotteryCode,
        globalDiscountCents: emittedDiscountCents,
      });
      setStep("success");
    },
  });

  const mutationError =
    mutation.data?.error ??
    (mutation.isError ? "Errore durante l'emissione. Riprova." : undefined);

  /** Sconto di riga corrente in euro, gia' clampato al lordo della riga. */
  const lineDiscountEuro = (): number =>
    Math.min(lineDiscountCents, amountCents * quantity) / 100;

  const resetLineForm = () => {
    setDescription("");
    setAmountCents(0);
    setQuantity(1);
    setVatCode(defaultVat);
    setLineDiscountCents(0);
    setLineDiscountOpen(false);
    setEditingLineId(null);
  };

  const handleCancelLine = () => {
    setStep("cart");
    resetLineForm();
  };

  const handleAddLine = () => {
    if (!canAdd) return;
    const lineData = {
      description: description.trim() || "Vendita",
      quantity,
      grossUnitPrice: parsedAmount,
      // Sconto DELLA riga, non per unita': e' la grandezza che l'AdE si
      // aspetta in `scontoLordo` e quella che l'esercente ha in mente.
      lineDiscount: lineDiscountEuro(),
      vatCode,
    };
    if (editingLineId) {
      updateLine(editingLineId, lineData);
      setEditingLineId(null);
    } else {
      addLine(lineData);
    }
    resetLineForm();
    setStep("cart");
  };

  /**
   * Un prodotto del catalogo entra nel carrello: con un prezzo valido come
   * riga diretta (quantità 1, fusa con una riga identica da `addLine`), senza
   * prezzo aprendo il tastierino con descrizione e IVA già impostate. Unico
   * ingresso sia per il tap sulla griglia della cassa sia per l'arrivo dalla
   * pagina Catalogo via query string.
   */
  const handleCatalogSelect = (item: CatalogSelection) => {
    const price =
      item.defaultPrice === null
        ? Number.NaN
        : Number.parseFloat(item.defaultPrice);
    if (Number.isFinite(price) && price >= 0) {
      addLine({
        description: item.description,
        quantity: 1,
        grossUnitPrice: price,
        vatCode: item.defaultVatCode,
      });
      return;
    }
    setDescription(item.description);
    setVatCode(item.defaultVatCode);
    setStep("add-item");
  };

  // Arrivo dalla pagina Catalogo:
  //   ?description=...&price=...&vatCode=...  → aggiunge direttamente al carrello
  //   ?prefillDescription=...&prefillVatCode=... → apre il tastierino pre-compilato
  useEffect(() => {
    if (catalogParamConsumed.current) return;

    const fromCatalog = catalogItemFromParams(searchParams);
    if (!fromCatalog) return;

    catalogParamConsumed.current = true;
    // Init-from-URL al mount: caso d'uso che React docs "You Might Not Need an Effect" elenca tra le eccezioni.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleCatalogSelect(fromCatalog);
    router.replace("/dashboard/cassa");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Con il catalogo, tornare al carrello vuol dire tornare alla griglia: dal
  // tastierino (più alto dello schermo) si rientrerebbe scrollati in basso,
  // con i prodotti fuori vista. Senza catalogo lo scroll resta com'è.
  const hasCatalog = catalogItems.length > 0;
  useEffect(() => {
    if (step === "cart" && hasCatalog) window.scrollTo({ top: 0 });
  }, [step, hasCatalog]);

  // Auto-svuota il codice lotteria se il totale scende sotto €1 (es. dopo clearCart o
  // emissione di un nuovo scontrino): senza questo reset, il codice del cliente
  // precedente sopravviverebbe nello state e verrebbe inviato al prossimo submit.
  // Confronto in centesimi interi (regola 17): è la stessa soglia che applica
  // `resolveLotteryCode` lato server, quindi client e server non divergono mai.
  useEffect(() => {
    if (totalCents < 100 && lotteryCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLotteryCode("");
    }
  }, [totalCents, lotteryCode]);

  const handlePaymentMethodChange = (method: typeof paymentMethod) => {
    setPaymentMethod(method);
    if (method !== "PE") setLotteryCode("");
  };

  /**
   * La ripartizione da trasmettere, o `undefined` quando il pagamento è su una
   * modalità sola. La quota elettronica è il resto dell'incassato: è così che
   * la quadratura della voce #5 è vera per costruzione invece che verificata.
   */
  const buildPayments = (): PaymentInput[] | undefined => {
    if (splitCashCents === null) return undefined;
    const split = splitCashElectronic(
      totalCents - globalDiscountCents,
      splitCashCents,
    );
    return [
      { type: "PC", amount: split.cashCents / 100 },
      { type: "PE", amount: split.electronicCents / 100 },
    ];
  };

  const handleSubmit = () => {
    const payments = buildPayments();
    const payload = {
      businessId,
      lines,
      // Mutuamente esclusivi: lo schema pretende esattamente uno dei due.
      paymentMethod: payments ? undefined : paymentMethod,
      payments,
      lotteryCode: lotteryCode || null,
      // Assente quando non c'e': tiene il payload — e quindi il fingerprint di
      // idempotenza — identico a quello di prima che il campo esistesse.
      globalDiscount:
        globalDiscountCents > 0 ? globalDiscountCents / 100 : undefined,
    };
    mutation.mutate({
      ...payload,
      // Il payload serializzato è il fingerprint: copre tutto ciò che il
      // server hasha in `hashSaleRequest`, e qualcosa in più. Più fine del
      // necessario ruota qualche volta di troppo; più grossolano lascerebbe
      // passare un cambiamento che il server vede, cioè un mismatch.
      idempotencyKey: idempotency.keyFor(JSON.stringify(payload)),
    });
  };

  const handleNewReceipt = () => {
    clearCart();
    setGlobalDiscountCents(0);
    setSplitCashCents(null);
    mutation.reset();
    setSuccessData(null);
    setStep("cart");
  };

  // ---- STEP: successo ----
  if (step === "success") {
    return (
      <ReceiptSuccess
        documentId={successData?.documentId}
        adeProgressive={successData?.adeProgressive}
        adeTransactionId={successData?.adeTransactionId}
        adeRegisteredAt={successData?.adeRegisteredAt}
        lines={successData?.lines ?? []}
        paymentMethod={successData?.paymentMethod ?? paymentMethod}
        payments={successData?.payments ?? null}
        lotteryCode={successData?.lotteryCode ?? null}
        globalDiscountCents={successData?.globalDiscountCents ?? 0}
        printProfile={printProfile}
        onNewReceipt={handleNewReceipt}
      />
    );
  }

  // ---- STEP: aggiungi / modifica articolo ----
  if (step === "add-item") {
    const isEditing = editingLineId !== null;
    return (
      <div className="mx-auto max-w-sm space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            {isEditing ? "Modifica articolo" : "Aggiungi articolo"}
          </h1>
          <Button variant="ghost" size="sm" onClick={handleCancelLine}>
            Annulla
          </Button>
        </div>

        {/* Descrizione */}
        <Input
          type="text"
          placeholder="Descrizione (opzionale)"
          autoComplete="off"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            // Invio passa all'importo, come un Tab: descrizione → importo →
            // Invio aggiunge, senza lasciare la tastiera. Durante una
            // composizione IME l'Invio conferma il testo e resta qui.
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            amountKeypadRef.current?.focus();
          }}
          className="rounded-xl py-3 text-base"
        />

        {/* Display importo + tastierino: il clic sul display torna al
            tastierino senza digitare una cifra. */}
        <NumericKeypad
          ref={amountKeypadRef}
          aria-label="Importo"
          display={
            <div className="mb-4 rounded-xl px-4 py-6 text-center">
              <span
                className={`text-4xl font-bold tracking-tight tabular-nums transition-opacity ${amountCents > 0 ? "opacity-100" : "text-muted-foreground opacity-30"}`}
              >
                {formatCurrency(parsedAmount)}
              </span>
            </div>
          }
          value={amountCents}
          onChange={setAmountCents}
          autoFocus
          onSubmit={handleAddLine}
          onCancel={handleCancelLine}
        />

        {/* Quantità */}
        <div className="flex items-center justify-between rounded-xl border px-4 py-3">
          <span className="text-sm font-medium">Quantità</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Diminuisci quantità"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold"
            >
              −
            </button>
            <span className="w-8 text-center font-semibold">{quantity}</span>
            <button
              type="button"
              aria-label="Aumenta quantità"
              onClick={() => setQuantity((q) => q + 1)}
              className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Selettore IVA */}
        <div>
          <p className="text-muted-foreground mb-2 text-sm font-medium">
            Aliquota IVA
          </p>
          <VatSelector value={vatCode} onChange={setVatCode} />
        </div>

        {/* Sconto di riga (Pro) — progressive disclosure, come lo sconto a
            pagare nel riepilogo. Sta DOPO l'aliquota di proposito: lo sconto
            di riga agisce sulla base imponibile di quella aliquota.

            Renderizzato anche a importo 0, solo disabilitato: `canAdd` è la
            stessa condizione che sblocca il CTA "Aggiungi" qui sotto, quindi
            gatelo sul render farebbe comparire questa riga nello stesso frame
            in cui il bottone si abilita — spingendolo in basso proprio mentre
            il pollice ci sta scendendo sopra. Lo spazio si riserva. */}
        {discountsUnlocked && !lineDiscountOpen && (
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => setLineDiscountOpen(true)}
            className="text-muted-foreground hover:text-foreground text-sm font-medium underline underline-offset-4 disabled:pointer-events-none disabled:opacity-40"
          >
            {"+ Sconto su questo articolo"}
          </button>
        )}

        {discountsUnlocked && lineDiscountOpen && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-muted-foreground text-sm font-medium">
                Sconto sulla riga
              </p>
              <button
                type="button"
                aria-label="Rimuovi sconto di riga"
                onClick={() => {
                  setLineDiscountOpen(false);
                  setLineDiscountCents(0);
                }}
                className="text-muted-foreground hover:bg-muted rounded-lg p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NumericKeypad
              aria-label="Sconto sulla riga"
              display={
                <div className="rounded-xl py-2 text-center">
                  <span className="text-3xl font-bold tracking-tight tabular-nums">
                    {"-"}
                    {formatCurrency(lineDiscountEuro())}
                  </span>
                </div>
              }
              autoFocus
              onSubmit={handleAddLine}
              onCancel={handleCancelLine}
              value={lineDiscountCents}
              onChange={(cents) =>
                setLineDiscountCents(Math.min(cents, amountCents * quantity))
              }
            />
            <p className="text-muted-foreground mt-2 text-xs">
              {
                "Sconto sull\u2019intera riga, non per pezzo. Riduce l\u2019imponibile e quindi l\u2019IVA: la riga vale "
              }
              {formatCurrency(
                (amountCents * quantity) / 100 - lineDiscountEuro(),
              )}
              {"."}
            </p>
          </div>
        )}

        {/* Aggiungi / Aggiorna */}
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleAddLine}
          disabled={!canAdd}
        >
          {isEditing ? "Aggiorna" : "Aggiungi"}
        </Button>
      </div>
    );
  }

  // ---- STEP: riepilogo ----
  if (step === "summary") {
    return (
      <div className="mx-auto max-w-sm space-y-2">
        {mutation.data?.reauthRequired && (
          <AdeReauthBanner
            method={mutation.data.reauthRequired}
            businessId={businessId}
            actionLabel="Emetti scontrino"
            onDismiss={() => mutation.reset()}
          />
        )}
        {mutationError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm"
          >
            <p className="text-destructive">
              {mutationError === TRIAL_EXPIRED_MESSAGE ? (
                <TrialExpiredMessage />
              ) : (
                <>
                  {mutationError}
                  {!isCollaborator &&
                    mutationError.includes(
                      "Credenziali AdE non verificate",
                    ) && (
                      <>
                        {" "}
                        <Link
                          href="/dashboard/settings"
                          className="font-medium underline"
                        >
                          {"Verificale ora"}
                        </Link>
                      </>
                    )}
                </>
              )}
            </p>
            {mutation.data?.code === "PENDING_IN_PROGRESS" && (
              <p className="text-muted-foreground mt-2 text-xs">
                {
                  "Non riemettere con lo stesso carrello: rischieresti un doppione fiscale. Se lo scontrino resta in sospeso, in cima alla pagina comparirà l'avviso per verificarne lo stato all'Agenzia delle Entrate."
                }
              </p>
            )}
            {!isCollaborator && mutation.data?.passwordExpired && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setChangePasswordOpen(true)}
              >
                {"Cambia password Fisconline"}
              </Button>
            )}
          </div>
        )}
        <ChangeAdePasswordDialog
          businessId={businessId}
          open={changePasswordOpen}
          onClose={() => setChangePasswordOpen(false)}
          onSuccess={() => setChangePasswordOpen(false)}
        />
        <ReceiptSummary
          lines={lines}
          totalCents={totalCents}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={handlePaymentMethodChange}
          onRemoveLine={removeLine}
          onSubmit={handleSubmit}
          onBack={() => setStep("cart")}
          isSubmitting={mutation.isPending}
          lotteryCode={lotteryCode}
          onLotteryCodeChange={setLotteryCode}
          globalDiscountCents={globalDiscountCents}
          onGlobalDiscountChange={setGlobalDiscountCents}
          splitCashCents={splitCashCents}
          onSplitCashChange={setSplitCashCents}
          discountsUnlocked={discountsUnlocked}
        />
      </div>
    );
  }

  // ---- STEP: carrello (default) ----
  // Con il catalogo la cassa diventa griglia + carrello, con totale e azioni
  // in una barra fissa. Senza catalogo nulla cambia.
  return (
    <div className="mx-auto max-w-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cassa</h1>
        {lines.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCart}
            className="text-destructive hover:text-destructive"
          >
            Svuota
          </Button>
        )}
      </div>

      <CatalogGrid
        items={catalogItems}
        lines={lines}
        onSelect={handleCatalogSelect}
      />

      {/* Lista articoli o stato vuoto */}
      {lines.length === 0 && hasCatalog && (
        <p className="text-muted-foreground rounded-xl border-2 border-dashed py-4 text-center text-sm">
          Tocca un prodotto o «Importo libero».
        </p>
      )}
      {lines.length === 0 && !hasCatalog && (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed py-12 text-center">
          <ShoppingCart
            className="text-muted-foreground h-10 w-10"
            aria-hidden="true"
          />
          <p className="text-muted-foreground text-sm">
            Nessun articolo.
            <br />
            Premi il bottone + per iniziare.
          </p>
        </div>
      )}
      {lines.length > 0 && (
        <div className="flex flex-col gap-2">
          {lines.map((line) => (
            <CartLineItem
              key={line.id}
              line={line}
              onRemove={removeLine}
              onEdit={(id) => {
                const l = lines.find((x) => x.id === id);
                if (!l) return;
                setEditingLineId(id);
                setDescription(
                  l.description === "Vendita" ? "" : l.description,
                );
                setAmountCents(Math.round(l.grossUnitPrice * 100));
                setQuantity(l.quantity);
                setVatCode(l.vatCode);
                const discountCents = Math.round((l.lineDiscount ?? 0) * 100);
                setLineDiscountCents(discountCents);
                setLineDiscountOpen(discountCents > 0);
                setStep("add-item");
              }}
            />
          ))}
        </div>
      )}

      <CartFooter
        sticky={hasCatalog}
        total={lines.length > 0 ? total : null}
        onAdd={() => setStep("add-item")}
        onContinue={() => setStep("summary")}
      />
    </div>
  );
}

/**
 * Totale + azioni del carrello. `sticky` (cassa con catalogo) li fissa sopra
 * la bottom nav e porta il totale dentro «Continua», al posto della riga
 * «Totale»: carrello lungo o no, il totale da dire al cliente e «Importo
 * libero» restano sotto il pollice, e l'altezza della riga torna al carrello.
 * Senza catalogo la resa è quella di sempre. `total` è `null` a carrello
 * vuoto: niente totale né «Continua».
 */
function CartFooter({
  sticky,
  total,
  onAdd,
  onContinue,
}: Readonly<{
  sticky: boolean;
  total: number | null;
  onAdd: () => void;
  onContinue: () => void;
}>) {
  return (
    <div
      className={
        sticky
          ? "bg-background sticky bottom-[calc(4rem_+_env(safe-area-inset-bottom))] -mx-4 border-t px-4 py-3 md:bottom-0 md:mx-0 md:px-0"
          : "space-y-4"
      }
    >
      {total !== null && !sticky && (
        <div className="bg-muted flex items-center justify-between rounded-xl px-4 py-3">
          <span className="font-medium">Totale</span>
          <span className="text-xl font-bold tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant={total === null ? "default" : "outline"}
          size="lg"
          className="flex-1"
          onClick={onAdd}
        >
          <Plus className="mr-2 h-5 w-5" />
          {sticky ? "Importo libero" : "Aggiungi"}
        </Button>

        {total !== null && (
          <Button
            type="button"
            size="lg"
            className="flex-1"
            onClick={onContinue}
          >
            {sticky ? (
              <span className="tabular-nums">
                Continua · {formatCurrency(total)}
              </span>
            ) : (
              "Continua"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
