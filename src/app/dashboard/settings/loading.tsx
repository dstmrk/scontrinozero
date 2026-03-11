import { Skeleton } from "@/components/ui/skeleton";

function SkeletonCard({ rows = 2 }: Readonly<{ rows?: number }>) {
  return (
    <div className="rounded-xl border">
      <div className="px-4 pt-4 pb-2">
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="px-4 pb-4 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full max-w-xs" />
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
