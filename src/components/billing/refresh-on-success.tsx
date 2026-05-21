"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface RefreshOnSuccessProps {
  /**
   * Quando true il componente invalida la cache RSC della tab corrente
   * via router.refresh() al mount. Usato dopo il redirect Stripe checkout
   * (`/dashboard/settings?success=1`) per garantire che il prossimo render
   * usi il plan aggiornato anche se l'utente naviga ad altre tab/pagine
   * gia' aperte (es. analytics) — la cache client-side RSC altrimenti
   * resterebbe con il vecchio plan finche' non c'e' un page reload.
   */
  readonly active: boolean;
}

export function RefreshOnSuccess({ active }: RefreshOnSuccessProps) {
  const router = useRouter();
  useEffect(() => {
    if (active) router.refresh();
  }, [active, router]);
  return null;
}
