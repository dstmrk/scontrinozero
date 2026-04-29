import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "Help Center ScontrinoZero — guide, tutorial, FAQ";
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="Help Center"
      subtitle="Guide, tutorial e risposte alle domande frequenti su ScontrinoZero."
    />,
    OG_SIZE,
  );
}
