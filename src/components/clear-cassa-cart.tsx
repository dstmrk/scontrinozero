"use client";

import { useEffect } from "react";
import { CASSA_SESSION_KEY } from "@/hooks/use-cassa";

// Pulisce il carrello in sessionStorage. Da montare sulle pagine raggiungibili
// solo da utenti non autenticati (login/register/reset-password/verify-email):
// evita che il carrello di un utente sopravviva al logout e venga ereditato
// da chi accede dopo nella stessa tab.
export function ClearCassaCart(): null {
  useEffect(() => {
    // Su browser mobile con storage bloccato (privacy/cookie disabilitati),
    // anche solo accedere a `window.sessionStorage` lancia SecurityError
    // (DOMException 18) — osservato in produzione su /login da Chrome Mobile
    // (Sentry SCONTRINOZERO-H). Se lo storage non è accessibile non esiste
    // alcun carrello persistito da ripulire: lo swallow è semanticamente
    // corretto (l'intento "nessun carrello eredita la sessione" è già
    // soddisfatto).
    try {
      sessionStorage.removeItem(CASSA_SESSION_KEY);
    } catch {
      // storage non disponibile: niente da ripulire
    }
  }, []);

  return null;
}
