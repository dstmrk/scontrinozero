import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;

interface OgImageTemplateProps {
  readonly title: string;
  readonly subtitle?: string;
  /**
   * Dimensione del titolo. Default 88px (landing brevi). Le pagine dinamiche
   * (guide, categorie, strumenti) passano un valore più piccolo per evitare
   * che titoli lunghi vadano in overflow nei 630px di altezza.
   */
  readonly titleFontSize?: number;
}

const BRAND_GRADIENT = "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)";

export function OgImageTemplate({
  title,
  subtitle,
  titleFontSize = 88,
}: OgImageTemplateProps): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px",
        background: BRAND_GRADIENT,
        color: "#f8fafc",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: "36px",
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        ScontrinoZero
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: `${titleFontSize}px`,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.025em",
            display: "flex",
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              fontSize: "32px",
              fontWeight: 400,
              opacity: 0.85,
              lineHeight: 1.3,
              marginTop: "24px",
              display: "flex",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: "24px",
          opacity: 0.7,
        }}
      >
        scontrinozero.it
      </div>
    </div>
  );
}
