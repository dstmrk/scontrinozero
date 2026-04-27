import { Skeleton } from "@/components/ui/skeleton";

const ITEM_KEYS = ["a", "b", "c"] as const;

export default function CassaLoading() {
  return (
    <div className="mx-auto max-w-sm space-y-4">
      {/* Header: titolo + bottone Svuota (assume carrello con items) */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>

      {/* Lista articoli (CartLineItem shape) */}
      <div className="flex flex-col gap-2">
        {ITEM_KEYS.map((key) => (
          <div
            key={key}
            className="bg-card flex items-start gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="mr-1 h-5 w-16" />
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-7 w-7 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Barra totale */}
      <div className="bg-muted flex items-center justify-between rounded-xl px-4 py-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-6 w-24" />
      </div>

      {/* Azioni: Aggiungi + Continua, affiancati */}
      <div className="flex gap-3">
        <Skeleton className="h-11 flex-1 rounded-md" />
        <Skeleton className="h-11 flex-1 rounded-md" />
      </div>
    </div>
  );
}
