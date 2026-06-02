import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";
import { getGuide, guideSlugs, isGuideSlug } from "@/lib/guide/articles";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "Guida ScontrinoZero";
export const contentType = "image/png";

export function generateStaticParams() {
  return guideSlugs.map((slug) => ({ slug }));
}

interface ImageParams {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function Image({ params }: ImageParams) {
  const { slug } = await params;
  const title = isGuideSlug(slug) ? getGuide(slug).title : "Guida";

  return new ImageResponse(
    <OgImageTemplate title={title} subtitle="Guida" titleFontSize={64} />,
    OG_SIZE,
  );
}
