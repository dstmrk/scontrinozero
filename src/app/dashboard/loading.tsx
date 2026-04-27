import { Skeleton } from "@/components/ui/skeleton";

const ROW_KEYS = ["a", "b", "c", "d", "e"] as const;

export default function CatalogoLoading() {
  return (
    <div className="mx-auto max-w-sm space-y-4">
      {/* Header: titolo + bottoni Modifica/Aggiungi */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Lista prodotti: righe single-line */}
      <div className="flex flex-col gap-2">
        {ROW_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center rounded-xl border px-4 py-3"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
