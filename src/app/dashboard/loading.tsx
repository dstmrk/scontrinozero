import { Skeleton } from "@/components/ui/skeleton";

const CARD_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

export default function CatalogoLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARD_KEYS.map((key) => (
          <div key={key} className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-20" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
