/**
 * IndexNow submission script.
 *
 * Pings Bing/Yandex (IndexNow protocol) with the full list of marketing URLs
 * from the production sitemap so they can be re-crawled on demand.
 *
 * Google does NOT participate in IndexNow — for GSC use the "Richiedi
 * indicizzazione" UI manually for priority URLs.
 *
 * The ownership-proof key file lives at `public/<INDEXNOW_KEY>.txt` with the
 * same value as the constant below. If you rotate the key, update both.
 *
 * Usage:
 *   npm run seo:indexnow            # uses production baseUrl
 *   NEXT_PUBLIC_APP_URL=https://sandbox.scontrinozero.it npm run seo:indexnow
 */

export const INDEXNOW_KEY = "add34d0a0f3d08a9282a447b6b9a26ac";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export function buildPayload(baseUrl: string, urls: string[]): IndexNowPayload {
  const url = new URL(baseUrl);
  const origin = url.origin;
  return {
    host: url.hostname,
    key: INDEXNOW_KEY,
    keyLocation: `${origin}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
}

export async function submitToIndexNow(
  payload: IndexNowPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export interface CliDeps {
  baseUrl: string;
  loadUrls: () => Promise<string[]>;
  submit?: typeof submitToIndexNow;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}

export async function runFromCli(deps: CliDeps): Promise<number> {
  const log = deps.log ?? console.log;
  const errLog = deps.error ?? console.error;
  const submit = deps.submit ?? submitToIndexNow;

  const urls = await deps.loadUrls();
  const payload = buildPayload(deps.baseUrl, urls);

  log(`Submitting ${urls.length} URLs to IndexNow (host: ${payload.host})…`);

  const result = await submit(payload);

  if (!result.ok) {
    errLog(`IndexNow failed: status=${result.status} body=${result.body}`);
    return 1;
  }

  log(`OK: status ${result.status}`);
  return 0;
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("indexnow-submit.ts")) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://scontrinozero.it";

  runFromCli({
    baseUrl,
    loadUrls: async () => {
      const { default: sitemap } = await import("../src/app/sitemap");
      return sitemap().map((entry) => entry.url);
    },
  })
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error("IndexNow submission threw:", err);
      process.exit(1);
    });
}
