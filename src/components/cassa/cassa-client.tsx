"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, ShoppingCart } from "lucide-react";
import { useCassa } from "@/hooks/use-cassa";
import { VAT_CODES, VatCode } from "@/types/cassa";
import { NumericKeypad } from "@/components/cassa/numeric-keypad";
import { VatSelector } from "@/components/cassa/vat-selector";
import { CartLineItem } from "@/components/cassa/cart-line-item";
import { ReceiptSummary } from "@/components/cassa/receipt-summary";
import { ReceiptSuccess } from "@/components/cassa/receipt-success";
import { Button } from "@/components/ui/button";
import { formatCurrency, parseAmount } from "@/lib/utils";
import { emitReceipt } from "@/server/receipt-actions";

type Step = "cart" | "add-item" | "summary" | "success";

const DEFAULT_VAT: VatCode = "22";

interface CassaClientProps {
  readonly businessId: string;
}

export function CassaClient({ businessId }: CassaClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    lines,
    paymentMethod,
    addLine,
    removeLine,
    clearCart,
    setPaymentMethod,
    total,
  } = useCassa();

  const [step, setStep] = useState<Step>("cart");

  // Pre-popola il carrello se navigato dal catalogo (?description=...&price=...&vatCode=...)
  useEffect(() => {
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
        addLine({
          description,
          quantity: 1,
          grossUnitPrice: parsedPrice,
          vatCode: vatCode as VatCode,
        });
        // Pulisce i params dall'URL senza aggiungere entry alla cronologia
        router.replace("/dashboard/cassa");
      }
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
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [vatCode, setVatCode] = useState<VatCode>(DEFAULT_VAT);

  const parsedAmount = parseAmount(amount);
  const canAdd = parsedAmount > 0;

  const mutation = useMutation({
    mutationFn: emitReceipt,
    onSuccess: (result) => {
      if (result.error) return; // Handled below via mutation.data
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
    addLine({
      description: description.trim() || "Vendita",
      quantity,
      grossUnitPrice: parsedAmount,
      vatCode,
    });
    // Reset form
    setDescription("");
    setAmount("");
    setQuantity(1);
    setVatCode(DEFAULT_VAT);
    setStep("cart");
  };

  const handleSubmit = () => {
    mutation.mutate({
      businessId,
      lines,
      paymentMethod,
      idempotencyKey: crypto.randomUUID(),
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

  // ---- STEP: aggiungi articolo ----
  if (step === "add-item") {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Aggiungi articolo</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep("cart");
              setAmount("");
              setDescription("");
              setQuantity(1);
              setVatCode(DEFAULT_VAT);
            }}
          >
            Annulla
          </Button>
        </div>

        {/* Descrizione */}
        <input
          type="text"
          placeholder="Descrizione (opzionale)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-background focus:ring-primary w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2"
        />

        {/* Display importo */}
        <div className="bg-muted rounded-xl px-4 py-5 text-center">
          <span
            className={`text-4xl font-bold tracking-tight transition-opacity ${amount ? "opacity-100" : "text-muted-foreground opacity-30"}`}
          >
            {amount ? formatCurrency(parsedAmount) : "€ 0,00"}
          </span>
        </div>

        {/* Tastierino numerico */}
        <NumericKeypad value={amount} onChange={setAmount} />

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

        {/* Aggiungi */}
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleAddLine}
          disabled={!canAdd}
        >
          Aggiungi
        </Button>
      </div>
    );
  }

  // ---- STEP: riepilogo ----
  if (step === "summary") {
    return (
      <div className="mx-auto max-w-sm space-y-2">
        {mutationError && (
          <p
            role="alert"
            className="text-destructive rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm"
          >
            {mutationError}
          </p>
        )}
        <ReceiptSummary
          lines={lines}
          total={total}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          onRemoveLine={removeLine}
          onSubmit={handleSubmit}
          onBack={() => setStep("cart")}
          isSubmitting={mutation.isPending}
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
          <ShoppingCart className="text-muted-foreground h-10 w-10" />
          <p className="text-muted-foreground text-sm">
            Nessun articolo.
            <br />
            Premi il bottone + per iniziare.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lines.map((line) => (
            <CartLineItem key={line.id} line={line} onRemove={removeLine} />
          ))}
        </div>
      )}

      {/* Totale */}
      {lines.length > 0 && (
        <div className="bg-muted flex items-center justify-between rounded-xl px-4 py-3">
          <span className="font-medium">Totale</span>
          <span className="text-xl font-bold">{formatCurrency(total)}</span>
        </div>
      )}

      {/* Azioni */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
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
