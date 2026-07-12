import Image from "next/image";
import { cn } from "@/lib/utils";

interface AppScreenshotProps {
  /** Percorso root-absolute dell'immagine (es. "/screenshots/scontrino-emesso.png"). */
  readonly src: string;
  /** Testo alternativo descrittivo (italiano, SEO/accessibilità). */
  readonly alt: string;
  /** Larghezza intrinseca del file, per il ratio di next/image. */
  readonly width: number;
  /** Altezza intrinseca del file, per il ratio di next/image. */
  readonly height: number;
  /** true solo per il mockup above-the-fold (LCP della hero). */
  readonly priority?: boolean;
  /** Hint per il responsive sizing di next/image. */
  readonly sizes?: string;
  /** Classi extra (dimensione, posizionamento nel cluster hero). */
  readonly className?: string;
}

/**
 * Mockup presentazionale di uno screenshot dell'app: la cornice del telefono è
 * già dentro il PNG trasparente, quindi qui non c'è nessun frame CSS — solo
 * ottimizzazione next/image, sizing e un'ombra `drop-shadow` che segue la sagoma
 * (funziona su sfondo chiaro e scuro). Nessuna logica → Server Component.
 */
export function AppScreenshot({
  src,
  alt,
  width,
  height,
  priority = false,
  sizes,
  className,
}: AppScreenshotProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      sizes={sizes}
      className={cn(
        "h-auto w-full max-w-full select-none",
        "drop-shadow-2xl dark:drop-shadow-[0_18px_40px_rgba(0,0,0,0.55)]",
        className,
      )}
    />
  );
}
