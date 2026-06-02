import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";
import { getTool, isToolSlug, toolSlugs } from "@/lib/strumenti/tools";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "Strumento gratuito — ScontrinoZero";
export const contentType = "image/png";

export function generateStaticParams() {
  return toolSlugs.map((slug) => ({ slug }));
}

interface ImageParams {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function Image({ params }: ImageParams) {
  const { slug } = await params;
  const title = isToolSlug(slug) ? getTool(slug).title : "Strumento gratuito";

  return new ImageResponse(
    <OgImageTemplate
      title={title}
      subtitle="Strumento gratuito"
      titleFontSize={64}
    />,
    OG_SIZE,
  );
}
