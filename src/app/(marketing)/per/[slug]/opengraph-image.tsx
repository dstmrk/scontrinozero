import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";
import {
  categories,
  categorySlugs,
  isCategorySlug,
} from "@/lib/per/categories";

export { OG_SIZE as size } from "@/components/og-image-template";

export const alt = "Soluzioni per categoria — ScontrinoZero";
export const contentType = "image/png";

export function generateStaticParams() {
  return categorySlugs.map((slug) => ({ slug }));
}

interface ImageParams {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function Image({ params }: ImageParams) {
  const { slug } = await params;
  const category = isCategorySlug(slug) ? categories[slug] : undefined;

  return new ImageResponse(
    <OgImageTemplate
      title={category?.title ?? "Soluzioni per categoria"}
      subtitle={category?.heroSubtitle}
      titleFontSize={64}
    />,
    OG_SIZE,
  );
}
