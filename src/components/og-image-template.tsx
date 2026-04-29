import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;

interface OgImageTemplateProps {
  readonly title: string;
  readonly subtitle?: string;
}

const BRAND_GRADIENT = "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)";

export function OgImageTemplate({
  title,
  subtitle,
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
            fontSize: "88px",
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
