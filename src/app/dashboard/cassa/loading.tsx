import { Skeleton } from "@/components/ui/skeleton";

const ITEM_KEYS = ["a", "b", "c"] as const;
const KEYPAD_KEYS = ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9", "k10", "k11", "k12"] as const;

export default function CassaLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Skeleton className="h-8 w-24" />

      {/* Item list */}
      <div className="space-y-3">
        {ITEM_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        ))}
      </div>

      {/* Totale */}
      <div className="space-y-2 rounded-lg border p-4">
        <div className="flex justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>

      {/* Keypad placeholder */}
      <div className="grid grid-cols-3 gap-2">
        {KEYPAD_KEYS.map((key) => (
          <Skeleton key={key} className="h-14 rounded-xl" />
        ))}
      </div>

      {/* Emetti button */}
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
