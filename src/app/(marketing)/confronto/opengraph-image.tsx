import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "ScontrinoZero a confronto con le alternative";
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="ScontrinoZero a confronto"
      subtitle="Registratore telematico, gestionali B2B e altri software per scontrini: quando ha senso scegliere noi."
      titleFontSize={72}
    />,
    OG_SIZE,
  );
}
