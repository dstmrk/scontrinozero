import { Skeleton } from "@/components/ui/skeleton";

const ROW_KEYS = ["a", "b", "c", "d", "e"] as const;

export default function StoricoLoading() {
  return (
    <div className="space-y-6">
      {/* Header: titolo + summary line */}
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>

      {/* Form filtri (dentro container bordato, con label sopra ogni control) */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border px-3 py-2">
        <div className="min-w-[200px] space-y-1">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="min-w-[140px] space-y-1">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-8 w-full" />
        </div>
        <Skeleton className="h-9 w-20" />
      </div>

      {/* Tabella scontrini */}
      <div className="overflow-hidden rounded-lg border">
        {/* Header tabella */}
        <div className="bg-muted/50 flex items-center gap-3 border-b px-3 py-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-4" />
        </div>

        {/* Righe */}
        {ROW_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center gap-3 border-b px-3 py-2 last:border-0"
          >
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-16" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
