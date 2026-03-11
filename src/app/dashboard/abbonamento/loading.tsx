import { Skeleton } from "@/components/ui/skeleton";

const PLAN_KEYS = ["starter", "pro"] as const;

export default function AbbonamentoLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Titolo */}
      <Skeleton className="h-8 w-36" />

      {/* Piano corrente */}
      <div className="space-y-3 rounded-lg border p-6">
        <Skeleton className="h-5 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      {/* Scegli piano */}
      <div className="space-y-4 rounded-lg border p-6">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          {PLAN_KEYS.map((key) => (
            <div key={key} className="space-y-3 rounded-lg border p-4">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-full" />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-20" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
