import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "ScontrinoZero — scontrini elettronici senza registratore";
export const contentType = "image/png";

// twitter:image site-wide brandizzato. Essendo l'unico twitter-image
// dell'albero, copre tutte le route con una card teal coerente (X usa questa
// invece del fallback su og:image).
export default function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="ScontrinoZero"
      subtitle="Scontrini elettronici e corrispettivi all'AdE dal cellulare, senza registratore di cassa."
    />,
    OG_SIZE,
  );
}
