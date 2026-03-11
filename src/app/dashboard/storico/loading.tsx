import { Skeleton } from "@/components/ui/skeleton";

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
      <div className="rounded-xl border overflow-hidden">
        {/* Header tabella */}
        <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>

        {/* Righe */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 items-center border-b last:border-0 px-4 py-3">
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
