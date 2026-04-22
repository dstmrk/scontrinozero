"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { useCassa } from "@/hooks/use-cassa";
import { VAT_CODES, VatCode } from "@/types/cassa";
import { NumericKeypad } from "@/components/cassa/numeric-keypad";
import { VatSelector } from "@/components/cassa/vat-selector";
import { CartLineItem } from "@/components/cassa/cart-line-item";
import { ReceiptSummary } from "@/components/cassa/receipt-summary";
import { ReceiptSuccess } from "@/components/cassa/receipt-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { emitReceipt } from "@/server/receipt-actions";
import { ChangeAdePasswordDialog } from "@/components/ade/change-ade-password-dialog";

type Step = "cart" | "add-item" | "summary" | "success";

const FALLBACK_VAT: VatCode = "22";

interface CassaClientProps {
  readonly businessId: string;
  readonly preferredVatCode?: VatCode;
}

export function CassaClient({
  businessId,
  preferredVatCode,
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
    total,
  } = useCassa();

  const [step, setStep] = useState<Step>("cart");
  // id dell'articolo in modifica (null = nuova aggiunta)
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lotteryCode, setLotteryCode] = useState("");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  // Ref guard: evita doppia esecuzione in React Strict Mode
  const catalogParamConsumed = useRef(false);

  // Pre-popola il carrello se navigato dal catalogo
  //   ?description=...&price=...&vatCode=...  → aggiunge direttamente al carrello
  //   ?prefillDescription=...&prefillVatCode=... → apre il tastierino pre-compilato
  useEffect(() => {
    if (catalogParamConsumed.current) return;

    const description = searchParams.get("description");
    const price = searchParams.get("price");
    const vatCode = searchParams.get("vatCode");

    if (
      description &&
      price &&
      vatCode &&
      VAT_CODES.includes(vatCode as VatCode)
    ) {
      const parsedPrice = Number.parseFloat(price);
      if (!Number.isNaN(parsedPrice) && parsedPrice >= 0) {
        catalogParamConsumed.current = true;
        addLine({
          description,
          quantity: 1,
          grossUnitPrice: parsedPrice,
          vatCode: vatCode as VatCode,
        });
        router.replace("/dashboard/cassa");
      }
      return;
    }

    const prefillDescription = searchParams.get("prefillDescription");
    const prefillVatCode = searchParams.get("prefillVatCode");

    if (
      prefillDescription &&
      prefillVatCode &&
      VAT_CODES.includes(prefillVatCode as VatCode)
    ) {
      catalogParamConsumed.current = true;
      setDescription(prefillDescription);
      setVatCode(prefillVatCode as VatCode);
      setStep("add-item");
      router.replace("/dashboard/cassa");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [successData, setSuccessData] = useState<{
    documentId?: string;
    adeProgressive?: string;
    adeTransactionId?: string;
  } | null>(null);

  // Stato form aggiungi articolo
  const [description, setDescription] = useState("");
  const [amountCents, setAmountCents] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [vatCode, setVatCode] = useState<VatCode>(defaultVat);

  const parsedAmount = amountCents / 100;
  const canAdd = amountCents > 0;

  const mutation = useMutation({
    mutationFn: emitReceipt,
    onSuccess: (result) => {
      if (result.error) {
        return; // Handled below via mutation.data
      }
      clearCart();
      setSuccessData({
        documentId: result.documentId,
        adeProgressive: result.adeProgressive,
        adeTransactionId: result.adeTransactionId,
      });
      setStep("success");
    },
  });

  const mutationError =
    mutation.data?.error ??
    (mutation.isError ? "Errore durante l'emissione. Riprova." : undefined);

  const handleAddLine = () => {
    if (!canAdd) return;
    const lineData = {
      description: description.trim() || "Vendita",
      quantity,
      grossUnitPrice: parsedAmount,
      vatCode,
    };
    if (editingLineId) {
      updateLine(editingLineId, lineData);
      setEditingLineId(null);
    } else {
      addLine(lineData);
    }
    // Reset form
    setDescription("");
    setAmountCents(0);
    setQuantity(1);
    setVatCode(defaultVat);
    setStep("cart");
  };

  // Auto-svuota il codice lotteria se il totale scende sotto €1
  useEffect(() => {
    if (total < 1 && lotteryCode) {
      setLotteryCode("");
    }
  }, [total, lotteryCode]);

  const handlePaymentMethodChange = (method: typeof paymentMethod) => {
    setPaymentMethod(method);
    if (method !== "PE") setLotteryCode("");
  };

  const handleSubmit = () => {
    mutation.mutate({
      businessId,
      lines,
      paymentMethod,
      idempotencyKey: crypto.randomUUID(),
      lotteryCode: lotteryCode || null,
    });
  };

  const handleNewReceipt = () => {
    clearCart();
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep("cart");
              setAmountCents(0);
              setDescription("");
              setQuantity(1);
              setVatCode(defaultVat);
              setEditingLineId(null);
            }}
          >
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
          className="rounded-xl py-3 text-base"
        />

        {/* Display importo */}
        <div className="rounded-xl px-4 py-6 text-center">
          <span
            className={`text-4xl font-bold tracking-tight tabular-nums transition-opacity ${amountCents > 0 ? "opacity-100" : "text-muted-foreground opacity-30"}`}
          >
            {formatCurrency(parsedAmount)}
          </span>
        </div>

        {/* Tastierino numerico */}
        <NumericKeypad value={amountCents} onChange={setAmountCents} />

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
        {mutationError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm"
          >
            <p className="text-destructive">
              {mutationError}
              {mutationError.includes("Credenziali AdE non verificate") && (
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
            </p>
            {mutation.data?.passwordExpired && (
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
          total={total}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={handlePaymentMethodChange}
          onRemoveLine={removeLine}
          onSubmit={handleSubmit}
          onBack={() => setStep("cart")}
          isSubmitting={mutation.isPending}
          lotteryCode={lotteryCode}
          onLotteryCodeChange={setLotteryCode}
        />
      </div>
    );
  }

  // ---- STEP: carrello (default) ----
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

      {/* Lista articoli o stato vuoto */}
      {lines.length === 0 ? (
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
      ) : (
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
                setStep("add-item");
              }}
            />
          ))}
        </div>
      )}

      {/* Totale */}
      {lines.length > 0 && (
        <div className="bg-muted flex items-center justify-between rounded-xl px-4 py-3">
          <span className="font-medium">Totale</span>
          <span className="text-xl font-bold tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
      )}

      {/* Azioni */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant={lines.length === 0 ? "default" : "outline"}
          size="lg"
          className="flex-1"
          onClick={() => setStep("add-item")}
        >
          <Plus className="mr-2 h-5 w-5" />
          Aggiungi
        </Button>

        {lines.length > 0 && (
          <Button
            type="button"
            size="lg"
            className="flex-1"
            onClick={() => setStep("summary")}
          >
            Continua
          </Button>
        )}
      </div>
    </div>
  );
}
