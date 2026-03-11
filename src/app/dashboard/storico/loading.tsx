import { Skeleton } from "@/components/ui/skeleton";

const ROW_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

export default function StoricoLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Skeleton className="h-8 w-28" />

      {/* Filtri */}
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-24" />
      </div>

      {/* Tabella */}
      <div className="overflow-hidden rounded-xl border">
        {/* Header tabella */}
        <div className="bg-muted/40 flex gap-4 border-b px-4 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>

        {/* Righe */}
        {ROW_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-0"
          >
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
