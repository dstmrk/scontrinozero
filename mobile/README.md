# ScontrinoZero — guscio iOS/Android

Guscio [Capacitor 8](https://capacitorjs.com) attorno all'app web deployata. Non
contiene interfaccia: carica l'app via `server.url`, quindi un deploy del web
aggiorna anche le app senza passare dalla review degli store. Il perché, le
decisioni e l'ordine delle slice sono in `docs/mobile-v2.md`.

Pacchetto npm separato dalla web app: dipendenze, lock e `tsconfig.json` suoi,
fuori dall'immagine Docker (`.dockerignore`) e dal type-check root.

## Ambiente

`server.url` si sceglie al `cap sync` con `MOBILE_TARGET`, e il sync lo scrive
nei progetti nativi: da lì il build resta legato a quell'ambiente finché non
rifai il sync. Non c'è un default, di proposito.

| Script                 | Carica                             | Note                                                 |
| ---------------------- | ---------------------------------- | ---------------------------------------------------- |
| `npm run sync:prod`    | `https://app.scontrinozero.it`     | l'unico con `ADE_MODE=real`: scontrini fiscali veri  |
| `npm run sync:sandbox` | `https://sandbox.scontrinozero.it` | AdE finta, Stripe test                               |
| `npm run sync:dev`     | `https://app-dev.scontrinozero.it` | dietro Cloudflare Access: login Access nella webview |

Le due app (dev e prod) condividono l'`appId` `it.scontrinozero.app`: sul
dispositivo una sostituisce l'altra.

## Primo avvio

Requisiti: Node ≥ 22, Xcode (iOS), Android Studio (Android).

```bash
cd mobile
npm install
npm run sync:sandbox
npm run open:ios        # oppure open:android, poi Run dal tuo IDE
```

`open:ios` e `open:android` passano `MOBILE_TARGET=prod` solo perché la CLI
carica la config a ogni comando: aprire l'IDE non riscrive `server.url`, lo fa
solo il sync.

## Plugin nativi e permessi

| Plugin                              | Slice                   | Lato web                                               |
| ----------------------------------- | ----------------------- | ------------------------------------------------------ |
| `@capgo/capacitor-inappbrowser`     | 3b, cattura cookie SPID | bottone «Collega con SPID», solo con `isNativeShell()` |
| `@capacitor-community/bluetooth-le` | 4, stampa BLE           | `src/lib/printing/native-ble-transport.ts`             |

I permessi che chiedono, dichiarati nei progetti nativi:

- **iOS** — `NSBluetoothAlwaysUsageDescription` in `ios/App/App/Info.plist`.
  Senza, iOS chiude l'app al primo accesso al Bluetooth.
- **Android** — in `android/app/src/main/AndroidManifest.xml`:
  `BLUETOOTH_SCAN` con `neverForLocation` da Android 12 (API 31), perché il
  trasporto cerca con `androidNeverForLocation`; `ACCESS_COARSE_LOCATION` e
  `ACCESS_FINE_LOCATION` solo fino ad Android 11 (`maxSdkVersion="30"`),
  dove la ricerca BLE richiede la posizione. Gli altri permessi Bluetooth
  arrivano dal manifest del plugin al merge.

Il testo del selettore nativo delle stampanti è in italiano via
`plugins.BluetoothLe.displayStrings` in `capacitor.config.ts`.

## Accettazione sul device

Cosa va visto prima di dire che una slice funziona. I test unitari coprono il
codice web, non il bridge: queste prove non le sostituisce niente.

**Guscio (slice 1).** L'app si apre e mostra il login di ScontrinoZero
dell'ambiente scelto.

**Cattura SPID (slice 3b).** Due tempi, perché su sandbox l'AdE è finta:
`MockAdeClient` accetta qualunque cookie, quindi lì si verifica la cattura,
non che i cookie funzionino.

1. Sandbox (`sync:sandbox`), da iOS e da Android: «Collega con SPID», login
   SPID, apertura di Documento commerciale online, collegamento riuscito e
   uno scontrino emesso. Nel log `connectAdeWithSpid: cookie ricevuti`
   compaiono `JSESSIONID`, `LtpaToken2`, `SIAMPE`, `SIAMPE_TAI`,
   `portaleCookie`, `B2BCookie`, `FATSC`. Dopo, `getCookies` del plugin
   sugli host AdE torna vuoto e Sentry non ha warning `flow:spid-capture`.
   Stessa prova chiudendo la webview con la X prima del DCO: il bottone
   dice cosa manca. Su iOS 15/16 anche `CapacitorCookies.getCookies` sugli
   host AdE torna vuoto.
2. Produzione (`sync:prod`), una volta su iOS e una su Android:
   collegamento SPID, poi uno scontrino da €0,01 emesso e annullato. È
   l'unica prova che i cookie catturati funzionino davvero (issue #1043).

**Stampa BLE (slice 4).** Dall'app: collegare una stampante ESC/POS BLE,
stampare uno scontrino, chiudere e riaprire l'app e ritrovarla collegata. Il
simulatore iOS non ha Bluetooth: serve un iPhone vero.

**Collaboratori (issue #1099).** Su sandbox (`sync:sandbox`), una volta da iOS
e una da Android. Serve un titolare in prova o su Team, con credenziali
Fisconline verificate.

1. Invito. Dal browser il titolare invita un'email nella card Collaboratori.
   Il link dell'email si apre nel browser e non nell'app: lì il collaboratore
   crea il suo accesso, poi entra nell'app con email e password.
2. Il collaboratore nell'app. Emette uno scontrino e lo stampa via BLE.
   Nello storico vede solo i suoi documenti e annulla solo quelli. Rende una
   vendita del titolare cercandola col numero stampato e la data. Il catalogo
   è in sola lettura. Le impostazioni non hanno credenziali AdE né
   abbonamento.
3. Dispositivo condiviso. Il collaboratore esce e il titolare entra sullo
   stesso telefono. Lo storico mostra i documenti dell'attività, e il tasto
   indietro di Android dopo l'uscita non riporta alle pagine del
   collaboratore.
4. Card bloccata. Con un titolare Starter o Pro la card Collaboratori
   nell'app dice «Li include il piano Team.» e il requisito Fisconline, ma
   non ha il bottone «Passa a Team», che nel browser invece c'è. Nessun
   prezzo né link d'acquisto nell'app (App Store 3.1.1, Payments policy di
   Google Play).
5. Sospensione. Il titolare passa a Pro dal browser. Nell'app il
   collaboratore vede l'avviso che lo manda dal titolare, senza inviti
   all'acquisto. Non emette più, ma lo storico resta leggibile.
6. Uscita. Il collaboratore elimina il suo account dalle impostazioni
   dell'app (App Store 5.1.1(v)). Un collaboratore rimosso dal titolare
   torna al login alla richiesta successiva.

## Cosa non c'è ancora

Icone e splash sono quelli del template Capacitor. Il resume di uno scontrino
rifiutato per sessione scaduta è da progettare (`docs/mobile-v2.md` punto 6).
Il link d'invito di un collaboratore si apre nel browser: l'app non registra
Universal Links né App Links.
