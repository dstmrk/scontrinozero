import { ImageResponse } from "next/og";
import { OgImageTemplate, OG_SIZE } from "@/components/og-image-template";
import { PLAN_PRICES } from "@/lib/plan-prices";

export { OG_SIZE as size } from "@/components/og-image-template";

const { starter, pro } = PLAN_PRICES;

export const alt = `Prezzi ScontrinoZero — Starter da ${starter.monthly}/mese, Pro ${pro.monthly}/mese`;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OgImageTemplate
      title="Prezzi"
      subtitle={`Starter ${starter.monthly}/mese, Pro ${pro.monthly}/mese. 30 giorni di prova senza carta.`}
    />,
    OG_SIZE,
  );
}
