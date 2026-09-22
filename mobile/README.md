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

Criterio di accettazione del guscio: l'app si apre sul simulatore e mostra il
login di ScontrinoZero dell'ambiente scelto.

## Cosa non c'è ancora

Nessun plugin nativo. La cattura del cookie SPID e la stampa BLE su iOS sono le
slice successive (`docs/mobile-v2.md` punto 12). Icone e splash sono quelli del
template Capacitor.
