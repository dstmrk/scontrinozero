import type { User } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin-gate";
import { logger } from "@/lib/logger";
import { getAuthenticatedUser } from "@/lib/server-auth";

/**
 * Gate di richiesta del pannello amministratore (`/admin`).
 *
 * Il controllo `isAdminEmail` non può stare solo nel layout: in App Router un
 * layout non è garantito girare a ogni richiesta. Se una richiesta RSC porta un
 * `Next-Router-State-Tree` che dichiara il layout già renderizzato, il server
 * rende soltanto il sottoalbero che differisce — la pagina — e il `notFound()`
 * del layout non viene mai eseguito. L'header lo sceglie il client. Le funzioni
 * che leggono i dati di TUTTI i tenant non hanno un endpoint proprio, ma la
 * pagina che le monta sì: il controllo va quindi ripetuto dove il dato viene
 * letto (`runAdminRead`) e dove la pagina si compone (`page.tsx`), non solo
 * sul percorso di render che passa dal layout.
 *
 * `getAuthenticatedUser` è in `cache()`: layout, pagina e dieci letture nello
 * stesso render condividono UNA chiamata a Supabase Auth.
 */

export class AdminAccessError extends Error {
  constructor(readonly reason: "unauthenticated" | "forbidden") {
    super(`admin access denied: ${reason}`);
    this.name = "AdminAccessError";
  }
}

/**
 * Restituisce l'utente se è un amministratore, altrimenti lancia
 * `AdminAccessError`. Per i punti che non possono redirigere (le letture dati).
 */
export async function requireAdmin(): Promise<User> {
  let user: User;
  try {
    user = await getAuthenticatedUser();
  } catch {
    throw new AdminAccessError("unauthenticated");
  }

  if (!isAdminEmail(user.email)) {
    // warn e non error (regola 20): è una condizione prevedibile — un URL
    // indovinato o condiviso — non un guasto. Solo lo user id, mai l'email
    // (denylist telemetria di src/lib/logger.ts).
    logger.warn(
      { errorClass: "admin_forbidden", userId: user.id },
      "admin: accesso negato, email fuori allowlist",
    );
    throw new AdminAccessError("forbidden");
  }

  return user;
}

/**
 * Variante per i server component: senza sessione rimanda al login, fuori
 * allowlist risponde **404, non 403** (un 403 confermerebbe a chiunque abbia un
 * account che il pannello esiste).
 */
export async function requireAdminOrNotFound(): Promise<User> {
  try {
    return await requireAdmin();
  } catch (err) {
    if (!(err instanceof AdminAccessError)) throw err;
    if (err.reason === "unauthenticated") redirect("/login");
    notFound();
  }
}
