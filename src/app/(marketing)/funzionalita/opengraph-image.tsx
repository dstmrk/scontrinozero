import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";

export const alt =
  "Funzionalità ScontrinoZero — emissione, gestione, compliance AdE";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="Funzionalità"
      subtitle="Scontrini in 5 secondi, trasmissione automatica AdE, lotteria, storico, condivisione."
    />,
    OG_SIZE,
  );
}
