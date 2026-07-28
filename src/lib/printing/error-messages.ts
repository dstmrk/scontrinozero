/**
 * Copy utente per gli esiti della stampa.
 *
 * Sta in un modulo condiviso perché lo stesso errore va detto allo stesso modo
 * nella card impostazioni e nel bottone "Stampa" della cassa. Ogni messaggio
 * dice **cosa fare**, non solo cosa è andato storto: chi è al banco con un
 * cliente davanti non ha tempo di interpretare.
 */

import type { PrintErrorCode } from "./bluetooth-printer";
import type { BluetoothPrintSupport } from "./support";

/** Messaggio azionabile per un fallimento di stampa o accoppiamento. */
export function printErrorMessage(code: PrintErrorCode): string {
  switch (code) {
    case "unsupported":
      return "Questo browser non supporta la stampa Bluetooth: usa Chrome su Android oppure stampa il PDF.";
    case "adapter-off":
      return "Il Bluetooth è spento. Attivalo dalle impostazioni del telefono e riprova.";
    case "not-selected":
      // Copre anche il caso Android < 12, dove la ricerca dei dispositivi BLE
      // non restituisce nulla se i servizi di localizzazione sono disattivati:
      // è la causa non ovvia che fa sembrare l'app rotta.
      return "Nessuna stampante selezionata. Accendi la stampante e riprova; su Android 11 e precedenti servono anche i servizi di localizzazione attivi.";
    case "not-connected":
      return "Nessuna stampante collegata. Collegala dalle impostazioni.";
    case "unreachable":
      return "Stampante non raggiungibile: controlla che sia accesa, con carta e a portata, poi ricollegala.";
  }
}

/** Spiegazione del perché la stampa Bluetooth non è disponibile qui. */
export function printSupportMessage(support: BluetoothPrintSupport): string {
  switch (support.status) {
    case "supported":
      return "";
    case "adapter-off":
      return "Il Bluetooth è spento: attivalo per collegare una stampante.";
    case "in-app-webview":
      // Recuperabile in un tap: vale la pena distinguerlo da "non supportato".
      return "Stai usando il browser interno di un'altra app. Apri ScontrinoZero in Chrome per collegare una stampante Bluetooth.";
    case "unsupported-browser":
      return "La stampa Bluetooth diretta funziona su Chrome, Edge e Samsung Internet per Android. Qui puoi comunque stampare il PDF su qualsiasi stampante.";
  }
}
