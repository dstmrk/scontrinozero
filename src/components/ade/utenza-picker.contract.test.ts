import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia sul contratto fra `verifyAdeCredentials` e il picker delle utenze.
 *
 * `verifyAdeCredentials` può rispondere `{ error, utenzaChoices }`: il testo
 * dice "scegli/conferma qui sotto la partita IVA" e le scelte arrivano nel
 * campo accanto. Le due metà sono un contratto solo, e chi mostra l'errore
 * senza montare il picker produce un vicolo cieco perfetto — un messaggio che
 * rimanda a qualcosa che non c'è, su un flusso da cui l'utente non ha nessun
 * modo di uscire.
 *
 * Non è ipotetico: il picker è nato coperto solo in impostazioni ed è rimasto
 * una release senza la sua metà in onboarding, che è l'unica superficie che un
 * esercente nuovo attraversa. Il primo utente arrivato all'AdE con un'utenza
 * incaricata si è bloccato lì, ha riprovato tre volte e ha scritto
 * all'assistenza convinto che fossero le credenziali.
 *
 * Prosa sostituita da questo gate, CLAUDE.md regola 7: una superficie nuova che
 * chiami l'azione senza gestire le scelte fa fallire `npm run test`, con
 * l'elenco dei file mancanti.
 */
const SRC_DIR = path.resolve(import.meta.dirname, "../..");

/** Chi definisce l'azione, non chi la consuma: si esclude da sé. */
const ACTION_MODULE = path.join("server", "onboarding-actions.ts");

/**
 * Superfici che chiamano l'azione e per cui il picker sarebbe codice morto,
 * ciascuna con il motivo per cui l'AdE non può offrire una scelta lì.
 *
 * Un'esenzione si aggiunge solo quando `runAdeVerification` è **strutturalmente**
 * incapace di ritornare `utenzaChoices` su quella superficie — non quando il
 * caso sembra raro. Le esenzioni sono a loro volta verificate: una che smette
 * di corrispondere a un chiamante reale fa fallire questa suite invece di
 * restare a coprire un buco.
 */
const PICKER_NOT_REACHABLE: Readonly<Record<string, string>> = {
  // Il banner parte solo da emit/void che ritornano `reauthRequired`, quindi su
  // un business già onboardato. Lì `runAdeVerification` prende il ramo
  // `wasAlreadyOnboarded` e risponde `pivaMismatch` **senza** scelte: offrire
  // il picker sarebbe un vicolo cieco al contrario, perché
  // `applyUtenzaSelection` rifiuta ogni scelta su un business già collegato.
  [path.join("components", "ade", "cie-reauth-banner.tsx")]:
    "solo business già onboardati: il ramo wasAlreadyOnboarded non offre scelte",
};

function isTestFile(name: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(name);
}

function collectSourceFiles(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry.name) && !isTestFile(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * I file che chiamano `verifyAdeCredentials`. Il match è sul nome importato,
 * non su una stringa qualsiasi: un commento che nomina l'azione non conta.
 */
function findVerifyCallers(): string[] {
  return collectSourceFiles(SRC_DIR, [])
    .filter((full) => path.relative(SRC_DIR, full) !== ACTION_MODULE)
    .filter((full) => {
      const source = readFileSync(full, "utf8");
      return (
        source.includes("verifyAdeCredentials") &&
        // `[^;]` copre già i newline: nessun flag `s` (dotAll) da chiedere al
        // target TS, e nessun `.` che possa correre oltre lo statement.
        /import\s[^;]*\bverifyAdeCredentials\b[^;]*from/.test(source)
      );
    })
    .map((full) => path.relative(SRC_DIR, full));
}

function findPickerSurfaces(): string[] {
  return findVerifyCallers().filter(
    (relative) => !(relative in PICKER_NOT_REACHABLE),
  );
}

function read(relative: string): string {
  return readFileSync(path.join(SRC_DIR, relative), "utf8");
}

describe("contratto verifyAdeCredentials ↔ UtenzaPicker", () => {
  it("trova le superfici che devono montare il picker", () => {
    // Se questo elenco si svuota il test smette di guardare qualcosa: sarebbe
    // verde per assenza di soggetto, non per correttezza.
    expect(findPickerSurfaces().length).toBeGreaterThan(0);
  });

  it("ogni superficie che chiama l'azione monta il picker", () => {
    const withoutPicker = findPickerSurfaces().filter(
      (relative) => !read(relative).includes("UtenzaPicker"),
    );

    expect(withoutPicker).toEqual([]);
  });

  it("ogni superficie che chiama l'azione legge le scelte dalla risposta", () => {
    const withoutChoices = findPickerSurfaces().filter(
      (relative) => !read(relative).includes("utenzaChoices"),
    );

    expect(withoutChoices).toEqual([]);
  });

  it("nessuna esenzione sopravvive al chiamante che la motivava", () => {
    // Un'esenzione stale è peggio di nessun gate: continua a coprire un file
    // che magari è stato rinominato, o che ha smesso di chiamare l'azione.
    const callers = new Set(findVerifyCallers());
    const orphaned = Object.keys(PICKER_NOT_REACHABLE).filter(
      (relative) => !callers.has(relative),
    );

    expect(orphaned).toEqual([]);
  });
});
