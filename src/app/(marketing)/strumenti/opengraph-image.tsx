import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "Strumenti gratuiti — ScontrinoZero";
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="Strumenti gratuiti"
      subtitle="Scorporo IVA, verifica codice Lotteria e calcolatore di risparmio."
    />,
    OG_SIZE,
  );
}
