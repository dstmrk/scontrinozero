import { guideSlugs } from "@/lib/guide/articles";
import { helpSlugs } from "@/lib/help/articles";
import { categorySlugs } from "@/lib/per/categories";
import { toolSlugs } from "@/lib/strumenti/tools";

/**
 * Validates the `?ref=` query string captured at signup time against an
 * explicit allowlist. The result is persisted to `profiles.signup_source`
 * for attribution analytics.
 *
 * Due dimensioni, un solo campo: il **canale** del soft launch (`reddit`,
 * `producthunt`) e la **pagina** da cui il visitatore ha cliccato la CTA
 * (`guide_codici-natura-iva`). Si distinguono da sé — nessun canale contiene
 * un underscore, e le pagine indice hanno un nome che nessun canale usa —
 * quindi non serve un secondo campo né una colonna nuova.
 *
 * Rules:
 * - Trim + lowercase before matching.
 * - Reject non-string, empty, over the length cap, or non `[a-z0-9_-]` input.
 * - Return null for anything outside the two allowlists — silently dropping
 *   garbage protects the column from PII / injection / spam attribution.
 */
export const ALLOWED_SIGNUP_SOURCES = [
  "reddit",
  "indiehackers",
  "linkedin",
  "hn",
  "twitter",
  "fb",
  "direct",
  "producthunt",
] as const;

export type SignupSource = (typeof ALLOWED_SIGNUP_SOURCES)[number];

/**
 * Pagine marketing senza slug: una sola pagina per nome, quindi il nome è la
 * sorgente. `guide`, `strumenti` e `per` sono le pagine **indice**, distinte
 * dai loro articoli (`guide_<slug>`). `help` non c'è: la sua indice non ha una
 * CTA di registrazione.
 */
const STATIC_PAGE_SOURCES = [
  "home",
  "prezzi",
  "funzionalita",
  "confronto",
  "guide",
  "strumenti",
  "per",
] as const;

export type StaticPageSource = (typeof STATIC_PAGE_SOURCES)[number];

/** Le superfici di contenuto con uno slug per pagina. */
export const CONTENT_CLUSTERS = ["guide", "per", "strumenti", "help"] as const;

export type ContentCluster = (typeof CONTENT_CLUSTERS)[number];

export type PageSignupSource = StaticPageSource | `${ContentCluster}_${string}`;

/**
 * `_` separa il cluster dallo slug perché nessuno slug lo contiene (sono
 * `[a-z0-9-]`) e nessun canale lo usa: il valore resta dentro il charset già
 * validato, quindi `VALID_CHARS` non cambia e l'URL non ha niente da
 * percent-encodare.
 *
 * Privata: chi costruisce una sorgente è `registerHref`, che è anche l'unico
 * posto da cui un link può nascere. Averne due pubbliche vorrebbe dire due
 * modi di scrivere lo stesso valore.
 */
function contentPageSource(cluster: ContentCluster, slug: string): string {
  return `${cluster}_${slug}`;
}

const CONTENT_SLUGS: Readonly<Record<ContentCluster, readonly string[]>> = {
  guide: guideSlugs,
  per: categorySlugs,
  strumenti: toolSlugs,
  help: helpSlugs,
};

/**
 * Derivata dai registry dei contenuti, non scritta a mano: un articolo nuovo è
 * subito una sorgente valida e uno rimosso smette di esserlo, senza che nessuno
 * debba ricordarsene. È l'unica ragione per cui questo modulo importa i
 * contenuti — il costo è un pezzo di module graph in più lato server, dove le
 * stesse pagine li caricano comunque.
 */
export const ALLOWED_PAGE_SOURCES: ReadonlySet<string> = new Set<string>([
  ...STATIC_PAGE_SOURCES,
  ...CONTENT_CLUSTERS.flatMap((cluster) =>
    CONTENT_SLUGS[cluster].map((slug) => contentPageSource(cluster, slug)),
  ),
]);

const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_SIGNUP_SOURCES);
// 96 e non 64: il cluster più lungo più lo slug più lungo pubblicato oggi
// stanno in 61 caratteri, e tre di margine sono una trappola per chi scrive
// la prossima guida. Il tetto è difesa in profondità — quello che decide
// davvero è l'appartenenza a uno dei due set chiusi.
const VALID_CHARS = /^[a-z0-9_-]{1,96}$/;

export function normalizeSignupSource(
  raw: string | null | undefined,
): SignupSource | PageSignupSource | null {
  if (typeof raw !== "string") return null;
  const normalised = raw.trim().toLowerCase();
  if (!VALID_CHARS.test(normalised)) return null;
  if (ALLOWED_SET.has(normalised)) return normalised as SignupSource;
  return ALLOWED_PAGE_SOURCES.has(normalised)
    ? (normalised as PageSignupSource)
    : null;
}
