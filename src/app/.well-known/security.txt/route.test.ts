import { afterEach, describe, expect, it, vi } from "vitest";
import { SECURITY_TXT_EXPIRES } from "./route";

const mockHeaderGet = vi.fn<(name: string) => string | null>();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: mockHeaderGet }),
}));

async function getResponse(): Promise<Response> {
  const { GET } = await import("./route");
  return GET();
}

/** Estrae il valore di un campo RFC 9116 (`Nome: valore`) dal corpo. */
function field(body: string, name: string): string | undefined {
  return body
    .split("\n")
    .find((line) => line.startsWith(`${name}: `))
    ?.slice(name.length + 2);
}

describe("GET /.well-known/security.txt", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockHeaderGet.mockReset();
  });

  it("serves text/plain on the production marketing apex", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const response = await getResponse();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  it("declares the two fields RFC 9116 makes mandatory", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    // Contact e Expires sono gli unici campi obbligatori: senza uno dei due il
    // file non è un security.txt valido e i validator lo scartano.
    expect(field(body, "Contact")).toBe("mailto:info@scontrinozero.it");
    expect(field(body, "Expires")).toBe(SECURITY_TXT_EXPIRES);
  });

  it("points Canonical at the indexable marketing apex, never the app domain", async () => {
    mockHeaderGet.mockReturnValue("www.scontrinozero.it");
    const body = await (await getResponse()).text();

    // Canonical deve essere l'URL su cui il file è autoritativo, non l'host
    // della richiesta: servito anche su `www.`, resta quello dell'apex.
    expect(field(body, "Canonical")).toBe(
      "https://scontrinozero.it/.well-known/security.txt",
    );
    expect(body).not.toContain("app.scontrinozero.it");
  });

  it("declares the languages a report is actually read in", async () => {
    mockHeaderGet.mockReturnValue("scontrinozero.it");
    const body = await (await getResponse()).text();

    expect(field(body, "Preferred-Languages")).toBe("it, en");
  });

  it("keeps the declared expiry at least 30 days away", () => {
    // Gate di rinnovo (non un test sul comportamento del route handler): un
    // security.txt scaduto vale zero, e nessuno si ricorda di rinnovarlo a
    // mano. Quando questo test diventa rosso: rivedi contatti e lingue, poi
    // sposta SECURITY_TXT_EXPIRES di un anno in `route.ts`.
    const marginDays =
      (Date.parse(SECURITY_TXT_EXPIRES) - Date.now()) / 86_400_000;

    expect(marginDays).toBeGreaterThan(30);
  });

  it("returns 404 on a non-indexable host (sandbox)", async () => {
    mockHeaderGet.mockReturnValue("sandbox.scontrinozero.it");
    const response = await getResponse();

    expect(response.status).toBe(404);
  });

  it("returns 404 on a self-hosted custom domain", async () => {
    // Un'istanza self-hosted non deve pubblicare i contatti di sicurezza di
    // ScontrinoZero: le sue vulnerabilità operative le gestisce chi la ospita.
    mockHeaderGet.mockReturnValue("cassa.example.com");
    const response = await getResponse();

    expect(response.status).toBe(404);
  });

  it("returns 404 when the host header is missing", async () => {
    mockHeaderGet.mockReturnValue(null);
    const response = await getResponse();

    expect(response.status).toBe(404);
  });
});
