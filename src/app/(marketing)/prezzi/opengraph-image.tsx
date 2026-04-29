import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";

export const alt =
  "Prezzi ScontrinoZero — Starter da €4.99/mese, Pro €8.99/mese";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="Prezzi"
      subtitle="Starter €4.99/mese, Pro €8.99/mese. 30 giorni di prova senza carta."
    />,
    OG_SIZE,
  );
}
