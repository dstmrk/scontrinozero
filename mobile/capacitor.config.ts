import type { CapacitorConfig } from "@capacitor/cli";
import { resolveServerUrl } from "./server-target";

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
