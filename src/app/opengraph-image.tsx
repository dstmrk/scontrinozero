import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "ScontrinoZero — scontrini elettronici senza registratore";
export const contentType = "image/png";

// OG generico brandizzato per le route fuori dal gruppo (marketing) — auth,
// onboarding, area app. Le pagine marketing hanno il proprio opengraph-image
// (più specifico) che ha la precedenza.
export default function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="ScontrinoZero"
      subtitle="Scontrini elettronici e corrispettivi all'AdE dal cellulare, senza registratore di cassa."
    />,
    OG_SIZE,
  );
}
