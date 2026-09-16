-- Migration 0040: la sede legale che l'AdE ha registrato sulla partita IVA
-- Feature: estende alla sede legale il confronto che la 0039 ha introdotto
-- sulla denominazione.
-- Evidenza: HAR.md #18.5, REVIEW.md #106.
--
-- La 0039 ha persistito un campo di `altriDatiIdentificativi`; gli altri cinque
-- che contano — indirizzo, civico, CAP, comune, provincia — restavano scartati,
-- ed erano esattamente lo stesso difetto. `buildCedenteFromBusiness` manda
-- all'AdE l'indirizzo digitato dall'utente al primo passo dell'onboarding, con
-- `modificati: true`, e quello finisce stampato. Chi opera per conto di una
-- societa' puo' quindi emettere uno scontrino con la P.IVA della societa' e il
-- proprio indirizzo di casa sopra.
--
-- Cinque colonne e non un JSONB: `businesses` tiene gia' l'indirizzo come
-- cinque colonne piatte, e questa e' la stessa forma osservata invece che
-- scelta. Piatte restano interrogabili ("quanti business hanno il comune
-- divergente?") senza operatori JSON, e non introducono un secondo modo di
-- rappresentare un indirizzo nella stessa tabella.
--
-- Nessun CHECK, per lo stesso motivo della 0039: le scrive l'AdE, di cui non
-- conosciamo i limiti, e un vincolo violato abortirebbe la transazione di
-- `finalizeAdeVerification` — che porta con se' `verified_at`, P.IVA, codice
-- fiscale e il claim del trial. Un indirizzo lungo farebbe fallire l'intero
-- onboarding. I limiti restano dove servono: sulla scrittura delle colonne
-- stampate, che rifiutano un allineamento fuori misura invece di troncarlo.
--
-- Nessun backfill: si valorizzano alla prossima verifica riuscita. NULL =
-- "mai osservato"; una stringa vuota dall'AdE viene normalizzata a NULL
-- dall'applicazione, perche' un campo che l'AdE non ha non e' un campo a cui
-- allinearsi.
--
-- Perche' la sede legale NON riscrive in automatico l'indirizzo stampato,
-- neanche quando diverge: per una societa' la sede legale puo' essere lo studio
-- del commercialista mentre il punto vendita sta altrove, e sullo scontrino ci
-- va il secondo. A differenza della denominazione, qui divergere e' un caso
-- legittimo e frequente, non il sintomo di un errore: l'avviso lo dice e
-- basta, e l'allineamento resta un'azione separata da quella sul nome.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS ade_indirizzo text,
  ADD COLUMN IF NOT EXISTS ade_numero_civico text,
  ADD COLUMN IF NOT EXISTS ade_cap text,
  ADD COLUMN IF NOT EXISTS ade_comune text,
  ADD COLUMN IF NOT EXISTS ade_provincia text;
