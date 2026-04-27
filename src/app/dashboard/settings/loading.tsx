import { Skeleton } from "@/components/ui/skeleton";

const ALL_ROW_KEYS = ["a", "b", "c", "d"] as const;

interface SkeletonCardProps {
  readonly rows?: number;
  readonly withEditButton?: boolean;
}

function SkeletonCard({ rows = 2, withEditButton = false }: SkeletonCardProps) {
  const rowKeys = ALL_ROW_KEYS.slice(0, rows);
  return (
    <div className="ring-foreground/10 bg-card flex flex-col gap-4 rounded-xl py-4 ring-1">
      <div className="flex items-center justify-between px-4">
        <Skeleton className="h-5 w-28" />
        {withEditButton && <Skeleton className="h-8 w-20" />}
      </div>
      <div className="space-y-2 px-4">
        {rowKeys.map((key) => (
          <Skeleton key={key} className="h-4 w-full max-w-xs" />
        ))}
      </div>
    </div>
  );
}

function SkeletonFlatSection({
  destructive = false,
}: Readonly<{ destructive?: boolean }>) {
  return (
    <div
      className={
        destructive
          ? "border-destructive/30 bg-destructive/5 rounded-lg border p-4"
          : "rounded-lg border p-4"
      }
    >
      <Skeleton className="mb-2 h-5 w-44" />
      <Skeleton className="mb-4 h-3 w-full max-w-md" />
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      {/* Titolo pagina */}
      <Skeleton className="h-8 w-44" />

      {/* Profilo (Card shadcn, con edit button nell'header) */}
      <SkeletonCard rows={2} withEditButton />

      {/* Sicurezza (Card shadcn, contiene il bottone Cambia password) */}
      <SkeletonCard rows={1} />

      {/* Credenziali AdE (Card shadcn, con edit button) */}
      <SkeletonCard rows={2} withEditButton />

      {/* Sessione (Card shadcn, contiene il bottone Esci) */}
      <SkeletonCard rows={1} />

      {/* Export dati (sezione flat, rounded-lg border) */}
      <SkeletonFlatSection />

      {/* Elimina account (sezione flat con bordo destructive) */}
      <SkeletonFlatSection destructive />
    </div>
  );
}
