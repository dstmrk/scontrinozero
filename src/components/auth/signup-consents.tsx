import Link from "next/link";

/**
 * Pezzi comuni ai due form che creano un account: la registrazione del
 * titolare e l'accettazione dell'invito di un collaboratore. I Termini sono
 * gli stessi per entrambi, quindi anche le clausole approvate per iscritto.
 */

/** Requisiti di `isStrongPassword`, detti a chi la sceglie. */
export const PASSWORD_REQUIREMENTS_HINT =
  "Almeno 8 caratteri con maiuscola, minuscola, numero e carattere speciale (es. !)";

/** Link a un documento legale, in una scheda nuova per non perdere il form. */
export function LegalLink({
  href,
  children,
}: Readonly<{ href: string; children: React.ReactNode }>) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline"
    >
      {children}
    </Link>
  );
}

/** Approvazione specifica delle clausole vessatorie dei Termini. */
export const SPECIFIC_CLAUSES_TEXT =
  "Accetto specificamente, ai sensi dell'art. 1341 c.c., le clausole: 9 (limitazione e cap di responsabilità), 10 (no rimborso corrispettivi già pagati), 11 (sospensione e cessazione unilaterale del servizio), 16 (foro esclusivo di Torino per controversie B2B).";
