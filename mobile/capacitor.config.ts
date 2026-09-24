import type { CapacitorConfig } from "@capacitor/cli";
// Estensione esplicita: con TypeScript 7, o quando Node carica il file col
// suo type stripping, la CLI lo importa come ESM nativo, che non risolve
// gli import senza estensione (ERR_MODULE_NOT_FOUND su `cap sync`).
import { resolveServerUrl } from "./server-target.ts";

const config: CapacitorConfig = {
  appId: "it.scontrinozero.app",
  appName: "ScontrinoZero",
  // Capacitor copia comunque webDir nei progetti nativi; con server.url il
  // contenuto non viene mai servito. Vedi www/index.html.
  webDir: "www",
  server: {
    url: resolveServerUrl(process.env.MOBILE_TARGET),
    cleartext: false,
  },
};

export default config;
