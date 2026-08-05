import { CONTACT_EMAIL } from "@/lib/contact";

/**
 * Nota di trasparenza in fondo ai contenuti editoriali (guide e articoli
 * /help).
 *
 * **Perché esiste.** Su contenuto fiscale la fiducia è metà del valore: sia
 * per i lettori, sia per i motori e i sistemi AI che devono decidere se
 * citarci. Prima questa nota viveva inline solo nelle guide, mentre nessuno
 * dei 28 articoli /help ne aveva una — pur trattando normativa (regime
 * forfettario, obbligo POS 2026, aliquote IVA).
 *
 * **Cosa NON dice, deliberatamente.** Nessuna rivendicazione di revisione da
 * parte di un professionista, nessuna cadenza di aggiornamento promessa,
 * nessuna certificazione, nessun impegno sui tempi di risposta: sono processi
 * che non esistono, e dichiararli su materia fiscale sarebbe una promessa
 * falsa — peggio del non avere la nota. Qui si afferma solo ciò che è
 * verificabile leggendo la pagina (le norme citate con estremo e data) e ciò
 * che è realmente offerto (un indirizzo a cui segnalare errori). Un test
 * presidia l'assenza di quelle rivendicazioni.
 *
 * La data di ultimo aggiornamento non è ripetuta qui: guide e articoli /help
 * la mostrano già in testa, derivata dal registry.
 */
export function EditorialNote() {
  return (
    <p className="text-muted-foreground mt-12 border-t pt-6 text-xs leading-relaxed">
      {
        "Quando citiamo una norma indichiamo estremo e data, così puoi verificarla alla fonte. Informazione divulgativa: non sostituisce la consulenza del commercialista, e per situazioni specifiche vanno sempre verificati la normativa aggiornata e il tuo codice ATECO. Hai trovato un'imprecisione? Segnalacela a "
      }
      <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">
        {CONTACT_EMAIL}
      </a>
      {"."}
    </p>
  );
}
