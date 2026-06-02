import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "Guide e approfondimenti — ScontrinoZero";
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="Guide e approfondimenti"
      subtitle="Scontrino elettronico, documento commerciale online, POS-RT e regime forfettario."
    />,
    OG_SIZE,
  );
}
