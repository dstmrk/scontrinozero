import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
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
    ],
  };
}
