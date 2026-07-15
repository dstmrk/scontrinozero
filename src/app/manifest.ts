import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    lang: "it",
    name: "ScontrinoZero",
    short_name: "ScontrinoZero",
    description:
      "Registratore di cassa virtuale. Emetti scontrini elettronici dal tuo smartphone.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait",
    theme_color: "#ffffff",
    background_color: "#ffffff",
    categories: ["finance", "productivity"],
    // Scorciatoie contestuali nel menu long-press dell'icona (Android/desktop).
    shortcuts: [
      {
        name: "Emetti scontrino",
        short_name: "Emetti",
        description: "Apri la cassa e batti un nuovo scontrino",
        url: "/dashboard/cassa",
        icons: [{ src: "/android-chrome-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Storico scontrini",
        short_name: "Storico",
        description: "Consulta gli scontrini emessi",
        url: "/dashboard/storico",
        icons: [{ src: "/android-chrome-192x192.png", sizes: "192x192" }],
      },
    ],
    // Screenshot narrow (mobile) per un install prompt ricco. Nessun asset
    // desktop → niente form_factor "wide".
    screenshots: [
      {
        src: "/screenshots/cassa-tastierino.png",
        sizes: "900x1944",
        type: "image/png",
        form_factor: "narrow",
        label: "Cassa con tastierino per emettere lo scontrino",
      },
      {
        src: "/screenshots/scontrino-emesso.png",
        sizes: "900x1860",
        type: "image/png",
        form_factor: "narrow",
        label: "Scontrino elettronico emesso e trasmesso all'AdE",
      },
      {
        src: "/screenshots/analytics-panoramica.png",
        sizes: "900x1860",
        type: "image/png",
        form_factor: "narrow",
        label: "Panoramica analytics degli incassi",
      },
    ],
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Variante maskable (contenuto nella safe-zone centrale 80%): senza questa
      // Android letterboxa l'icona "any" in un blob bianco / la ritaglia con le
      // maschere adattive. Va dichiarata separatamente da "any".
      {
        src: "/android-chrome-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
