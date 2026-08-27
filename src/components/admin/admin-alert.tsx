import { cn } from "@/lib/utils";

interface AdminAlertProps {
  readonly message: string;
  /** Es. `col-span-full` quando l'avviso prende il posto di più card. */
  readonly className?: string;
}

/**
 * Avviso inline di un blocco del pannello che non ha caricato.
 *
 * Ogni lettura degrada a `{ error }` per conto suo (regola 19), quindi in
 * pagina possono comparirne fino a sei: uno per blocco, al posto del solo
 * contenuto che dipendeva da quella query. Prima erano due `div` copiati nella
 * pagina; con sei call site la copia diventava il modo più facile per farli
 * divergere.
 */
export function AdminAlert({ message, className }: AdminAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm",
        className,
      )}
    >
      {message}
    </div>
  );
}
