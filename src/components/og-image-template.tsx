import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;

// Palette brand (da src/app/globals.css, oklch → hex: Satori non gestisce oklch).
const BRAND_GRADIENT = "linear-gradient(135deg, #009689 0%, #005f5a 100%)";

/**
 * Logo brand (ricevuta teal su trasparente) come data URI, letto una sola volta
 * a build-time (le OG image sono statiche). Degrada a "" se illeggibile, così
 * il template resta renderizzabile anche fuori dal contesto Next (es. test).
 */
function loadLogoSrc(): string {
  try {
    const data = readFileSync(join(process.cwd(), "public", "logo.png"));
    return `data:image/png;base64,${data.toString("base64")}`;
  } catch {
    return "";
  }
}

const DEFAULT_LOGO_SRC = loadLogoSrc();

interface OgImageTemplateProps {
  readonly title: string;
  readonly subtitle?: string;
  /**
   * Dimensione del titolo. Default 88px (landing brevi). Le pagine dinamiche
   * (guide, categorie, strumenti) passano un valore più piccolo per evitare
   * che titoli lunghi vadano in overflow nei 630px di altezza.
   */
  readonly titleFontSize?: number;
  /**
   * Logo da mostrare nel chip in header. Default: il logo brand embeddato.
   * Passa "" per ometterlo (usato dai test per coprire il ramo senza logo).
   */
  readonly logoSrc?: string;
}

export function OgImageTemplate({
  title,
  subtitle,
  titleFontSize = 88,
  logoSrc = DEFAULT_LOGO_SRC,
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
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        {logoSrc ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "84px",
              height: "84px",
              borderRadius: "18px",
              background: "#ffffff",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" width={60} height={60} />
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            fontSize: "36px",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          ScontrinoZero
        </div>
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
              opacity: 0.9,
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
          opacity: 0.75,
        }}
      >
        scontrinozero.it
      </div>
    </div>
  );
}
