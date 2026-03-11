import { Skeleton } from "@/components/ui/skeleton";

const ALL_ROW_KEYS = ["a", "b", "c", "d"] as const;

function SkeletonCard({ rows = 2 }: Readonly<{ rows?: number }>) {
  const rowKeys = ALL_ROW_KEYS.slice(0, rows);
  return (
    <div className="rounded-xl border">
      <div className="px-4 pb-2 pt-4">
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="space-y-2 px-4 pb-4">
        {rowKeys.map((key) => (
          <Skeleton key={key} className="h-4 w-full max-w-xs" />
        ))}
      </div>
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      {/* Titolo */}
      <Skeleton className="h-8 w-36" />

      {/* Profilo */}
      <SkeletonCard rows={2} />

      {/* Attività */}
      <SkeletonCard rows={4} />

      {/* Credenziali AdE */}
      <SkeletonCard rows={2} />

      {/* Export + Elimina account */}
      <SkeletonCard rows={1} />
      <SkeletonCard rows={1} />
    </div>
  );
}
