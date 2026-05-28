"use client";

import { useEffect } from "react";
import { CASSA_SESSION_KEY } from "@/hooks/use-cassa";

// Pulisce il carrello in sessionStorage. Da montare sulle pagine raggiungibili
// solo da utenti non autenticati (login/register/reset-password/verify-email):
// evita che il carrello di un utente sopravviva al logout e venga ereditato
// da chi accede dopo nella stessa tab.
export function ClearCassaCart(): null {
  useEffect(() => {
    sessionStorage.removeItem(CASSA_SESSION_KEY);
  }, []);

  return null;
}
