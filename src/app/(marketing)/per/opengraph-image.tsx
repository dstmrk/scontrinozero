import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "Soluzioni per categoria — ScontrinoZero";
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="Soluzioni per categoria"
      subtitle="Ambulanti, artigiani, officine, palestre, food truck, NCC e altre attività."
    />,
    OG_SIZE,
  );
}
