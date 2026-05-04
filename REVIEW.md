# REVIEW — Audit multi-pass (sicurezza, performance, funzionalità, architettura)

## Metodo usato

- Verifica preliminare di `PLAN.md` per evitare duplicati con backlog già pianificato.
- **Passata 1**: analisi dei flussi API core (`/api/v1/*`, Stripe webhook, auth API key, utility body parsing).
- **Passata 2**: analisi approfondita integrazione AdE (`RealAdeClient`) e crittografia/config runtime.
- **Passata 3**: ricontrollo mirato dei punti già emersi + ricerca di ulteriori issue.
- **Stop condition raggiunta**: nella passata 3 non sono emerse nuove issue rispetto alla passata 2.

---

## Finding prioritizzati

## P0 — Critico

### 1) Possibile SSRF/egress non intenzionale durante redirect AdE (followRedirectChain)

**Categoria**: Sicurezza  
**Impatto**: Alto  
**Probabilità**: Media

#### Evidenza tecnica

`followRedirectChain()` segue i redirect usando direttamente `Location` quando assoluto (`http...`) senza validare allowlist host/scheme. In caso di risposta compromessa/upstream anomalo, il server potrebbe effettuare richieste verso host arbitrari (SSRF lato server e data exfiltration verso destinazioni inattese).

#### Rischio pratico

- Chiamate server-side verso endpoint non previsti (intranet metadata, servizi interni, ecc.).
- Potenziale leakage di cookie/header se in futuro cambia la logica di inoltro.
- Aumento superficie d’attacco supply-chain/upstream compromise.

#### Fix richiesto (non ambiguo)

1. Introdurre una allowlist stretta di host consentiti per tutti i redirect AdE (`ivaservizi.agenziaentrate.gov.it`, `iampe.agenziaentrate.gov.it`, `portale.agenziaentrate.gov.it`, `telematici.agenziaentrate.gov.it`).
2. Rifiutare redirect con scheme diverso da `https:`.
3. Per `Location` relative, risolvere URL rispetto all’**origin corrente** (non con base fissa unica), poi validare host/scheme.
4. Loggare evento di blocco con contesto minimo (`fromHost`, `toHost`, `status`) senza payload sensibile.
5. Aggiungere test unitari: redirect assoluto verso host non ammesso => errore dedicato; redirect relativo cross-domain valido => consentito.

---

## P1 — Alto

### 2) Calcolo totale documento con floating point in API receipt detail

**Categoria**: Funzionalità / Accuratezza fiscale  
**Impatto**: Alto  
**Probabilità**: Media

#### Evidenza tecnica

Nell’endpoint `GET /api/v1/receipts/[id]` il totale è calcolato con `Number.parseFloat(...)` e somma in floating point JS. Questo può introdurre drift di arrotondamento su combinazioni di righe/prezzi/quantità decimali.

#### Rischio pratico

- Disallineamento tra totale esposto da API e totale calcolato/storato in altri layer (PDF, storico, DB).
- Edge-case fiscali difficili da debuggare in riconciliazione.

#### Fix richiesto (non ambiguo)

1. Sostituire il calcolo locale con utility condivisa già orientata ai decimali fiscali (o calcolo in centesimi interi / decimal library).
2. Consolidare un’unica funzione “source of truth” per totale documento usata da API, export e PDF.
3. Aggiungere test con casi noti di floating error (`0.1`, `0.2`, quantità decimali) e snapshot del totale atteso.
4. Verificare retrocompatibilità formato output (`string` con 2 decimali).

---

### 3) Validazione incompleta di `ENCRYPTION_KEY_VERSION`

**Categoria**: Robustezza / Sicurezza operativa  
**Impatto**: Alto  
**Probabilità**: Media

#### Evidenza tecnica

`getKeyVersion()` usa `parseInt` senza validazione forte su range/tipo. Valori invalidi (`NaN`, `0`, `-1`, `999`, stringhe sporche) possono propagarsi fino a errori runtime in `encrypt()` o stati applicativi incoerenti in produzione.

#### Rischio pratico

- Fault in runtime all’atto di cifrare dati sensibili.
- Deploy apparentemente “ok” ma rottura lazy al primo path che cifra.
- Operazioni di rotazione chiavi più fragili.

#### Fix richiesto (non ambiguo)

1. Validare `ENCRYPTION_KEY_VERSION` in modo strict: intero, `1..255`.
2. Fail-fast in bootstrap/startup con errore esplicito e action message.
3. Aggiungere test unitari parametrizzati su input env validi/invalidi.
4. (Opzionale consigliato) centralizzare validazione env critiche in modulo unico.

---

## P2 — Medio

### 4) Header HTTP “di risposta” inviati come request headers verso AdE

**Categoria**: Architettura / Bad practice  
**Impatto**: Medio  
**Probabilità**: Alta

#### Evidenza tecnica

`SUBMIT_HEADERS` include header tipicamente di **risposta server** (`X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Strict-Transport-Security`) inviati nelle richieste client->AdE. Non aggiungono sicurezza reale della richiesta e aumentano rumore/manutenzione.

#### Rischio pratico

- Confusione futura su cosa sia davvero necessario per protocollo AdE.
- Possibili incompatibilità future se upstream fa validazioni strette su header attesi.
- Debito tecnico documentale/operativo.

#### Fix richiesto (non ambiguo)

1. Ridurre `SUBMIT_HEADERS` al minimo necessario osservato da HAR e protocolli AdE (`Accept`, `Content-Type`, `Origin`, `Referer`, eventuale `User-Agent` se davvero richiesto).
2. Documentare in commento per ogni header “perché serve”.
3. Aggiungere test di regressione per garantire che il payload submit continui a funzionare senza header superflui.

---

## Esito passate

- **Passata 1**: trovate issue #2.
- **Passata 2**: trovate issue #1, #3, #4.
- **Passata 3**: nessuna nuova issue aggiuntiva rispetto alla passata 2.

**Conclusione**: backlog review stabile raggiunto (X+1 senza nuovi finding).
