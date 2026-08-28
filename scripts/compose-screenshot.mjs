/**
 * Reincolla la schermata dell'app dentro la cornice telefono di uno screenshot
 * esistente di `public/screenshots/`, senza toccare un pixel della cornice.
 *
 * Le immagini di `public/screenshots/` non sono catture grezze: sono la
 * schermata dell'app incollata in una cornice telefono con una status bar
 * finta disegnata sopra. La cornice vive nel bitmap, non nel componente
 * `AppScreenshot`, e ogni immagine ha la sua altezza — quindi non esiste un
 * template da riusare. Questo script non la ridisegna: la misura
 * sull'originale e ci reincolla dentro solo il vetro.
 *
 * L'ultimo passo e' una GUARDIA, non un log: se un solo pixel fuori dal vetro
 * cambia, esce 1 e non scrive nulla. E' la garanzia che rende sicuro
 * rigenerare uno screenshot senza riguardarlo a occhio.
 *
 * Uso:
 *   node scripts/compose-screenshot.mjs <originale.png> <cattura.png> <out.png>
 *   node scripts/compose-screenshot.mjs <originale.png> <cattura.png> --in-place
 *   ... --paste-y=N   per una cattura scrollata (vedi `planPaste`)
 *
 * La cattura si fa con la skill `playwright-verify`. Se l'altezza non e'
 * quella giusta lo script non indovina: dice a che viewport ricatturare.
 *
 * Serve anche a creare un asset NUOVO: si passa come "originale" uno
 * screenshot esistente con la cornice giusta, che fa da donatore, e come
 * output un nome nuovo. Cornice e status bar restano quelle, verificate dalla
 * guardia; cambia solo il vetro.
 */

/** Corsa minima di pixel chiari che identifica il vetro dello schermo. */
const BRIGHT_RUN = 20;
/** Un pixel "chiaro": opaco e senza canali scuri. Il bezel non passa. */
const MIN_BRIGHT = 150;
const MIN_ALPHA = 200;
/** Grigi che formano il divider sotto l'header dell'app. */
const DIVIDER_LO = 215;
const DIVIDER_HI = 248;
/** Quota di riga che deve essere grigia perche' sia un divider. */
const DIVIDER_RATIO = 0.9;
/** Rientro laterale per la ricerca del divider: evita gli artefatti di bordo. */
const DIVIDER_INSET = 0.06;
/** Larghezza CSS del viewport mobile con cui si catturano queste schermate. */
const DEFAULT_CSS_WIDTH = 390;
/** Tolleranza in px sull'altezza della cattura (arrotondamenti del DPR). */
const HEIGHT_SLACK_UNDER = 2;
const HEIGHT_SLACK_OVER = 4;

/**
 * @typedef {{ data: Uint8Array, width: number, height: number }} Rgba
 * Immagine RGBA raw, 4 canali per pixel.
 */

/** @param {Rgba} img @param {number} x @param {number} y */
function isBright(img, x, y) {
  const i = (y * img.width + x) * 4;
  const d = img.data;
  return (
    d[i + 3] > MIN_ALPHA &&
    d[i] > MIN_BRIGHT &&
    d[i + 1] > MIN_BRIGHT &&
    d[i + 2] > MIN_BRIGHT
  );
}

/**
 * Per ogni riga, l'intervallo x del vetro dello schermo.
 *
 * Si scandisce da FUORI verso dentro cercando una corsa di pixel chiari, non
 * il bezel scuro: il bordo esterno della cornice ha un alone semi-trasparente
 * che inganna qualunque soglia sullo scuro, e una scansione dal centro si
 * ferma sul testo scuro dell'app scambiandolo per bezel.
 *
 * @param {Rgba} img
 * @returns {Array<[number, number] | null>} una voce per riga
 */
export function glassSpans(img) {
  const spans = [];
  for (let y = 0; y < img.height; y++) {
    let left = null;
    for (let x = 0; x + BRIGHT_RUN <= img.width; x++) {
      let ok = true;
      for (let k = 0; k < BRIGHT_RUN && ok; k++) ok = isBright(img, x + k, y);
      if (ok) {
        left = x;
        break;
      }
    }
    let right = null;
    for (let x = img.width - 1; x - BRIGHT_RUN >= -1; x--) {
      let ok = true;
      for (let k = 0; k < BRIGHT_RUN && ok; k++) ok = isBright(img, x - k, y);
      if (ok) {
        right = x;
        break;
      }
    }
    spans.push(
      left !== null && right !== null && right > left ? [left, right] : null,
    );
  }
  return spans;
}

/**
 * Rettangolo che racchiude il vetro. `left`/`right` sono presi sulla riga piu'
 * larga, cioe' fuori dagli angoli arrotondati.
 *
 * @param {Array<[number, number] | null>} spans
 */
export function glassBounds(spans) {
  let top = -1;
  let bottom = -1;
  let left = Infinity;
  let right = -Infinity;
  for (let y = 0; y < spans.length; y++) {
    const s = spans[y];
    if (!s) continue;
    if (top === -1) top = y;
    bottom = y;
    if (s[1] - s[0] > right - left) {
      left = s[0];
      right = s[1];
    }
  }
  if (top === -1) return null;
  return { top, bottom, left, right, width: right - left + 1 };
}

/**
 * Riga del divider sotto l'header dell'app: la piu' scura del primo gruppo di
 * righe quasi interamente grigie.
 *
 * E' l'ancora di allineamento verticale. Allineare per correlazione
 * sull'header invece che su questa riga sbaglia di 2 px, perche'
 * l'antialiasing di un DPR frazionario non riproduce gli stessi pixel.
 *
 * @param {Rgba} img
 * @param {number} x0 @param {number} x1 @param {number} from
 * @returns {number | null}
 */
export function findDividerRow(img, x0, x1, from = 0) {
  const span = x1 - x0 + 1;
  let start = -1;
  let best = -1;
  let bestMean = Infinity;
  for (let y = from; y < img.height; y++) {
    let gray = 0;
    let sum = 0;
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
      if (
        r >= DIVIDER_LO &&
        r <= DIVIDER_HI &&
        g >= DIVIDER_LO &&
        g <= DIVIDER_HI &&
        b >= DIVIDER_LO &&
        b <= DIVIDER_HI
      ) {
        gray++;
      }
      sum += r;
    }
    const isDivider = gray / span >= DIVIDER_RATIO;
    if (isDivider) {
      if (start === -1) start = y;
      const mean = sum / span;
      if (mean < bestMean) {
        bestMean = mean;
        best = y;
      }
    } else if (start !== -1) {
      break; // finito il primo gruppo
    }
  }
  return best === -1 ? null : best;
}

/**
 * @typedef {{ top: number, bottom: number, left: number, right: number, width: number }} Glass
 * @typedef {{ ok: false, error: string }} PlanError
 * @typedef {{
 *   ok: true,
 *   spans: Array<[number, number] | null>,
 *   glass: Glass,
 *   pasteX: number,
 *   pasteY: number,
 *   required: number,
 *   dpr: number,
 *   cssHeight: number,
 * }} PlanOk
 */

/**
 * Decide dove incollare la cattura e se ha l'altezza giusta.
 *
 * Unione discriminata su `ok`: chi chiama restringe con `if (!plan.ok)` e da
 * lì in poi ha i campi garantiti, senza optional chaining difensivo.
 *
 * `opts.pasteY` salta il divider e incolla a un offset dato. Serve alle
 * catture **scrollate**, che non cominciano dall'header dell'app e quindi non
 * hanno il divider su cui allinearsi: senza override lo script si aggancia a
 * un'altra riga grigia e sbaglia di decine di px. Il valore si legge
 * dall'output di una composizione normale sullo stesso originale
 * ("Incollata a y=N"). Le altre verifiche restano tutte attive.
 *
 * @param {Rgba} original @param {Rgba} capture
 * @param {{ cssWidth?: number, pasteY?: number }} [opts]
 * @returns {PlanOk | PlanError}
 */
export function planPaste(original, capture, opts = {}) {
  const cssWidth = opts.cssWidth ?? DEFAULT_CSS_WIDTH;
  const spans = glassSpans(original);
  const glass = glassBounds(spans);
  if (!glass)
    return {
      ok: false,
      error:
        "Nessun vetro trovato nell'originale: e' davvero uno screenshot con la cornice?",
    };

  if (capture.width !== glass.width) {
    return {
      ok: false,
      error: `La cattura e' larga ${capture.width} px ma il vetro ne vuole ${glass.width}. Ricattura con deviceScaleFactor ${(glass.width / cssWidth).toFixed(4)} su un viewport da ${cssWidth} CSS px.`,
    };
  }

  let pasteY;
  if (opts.pasteY !== undefined) {
    pasteY = opts.pasteY;
  } else {
    const inset = Math.round(glass.width * DIVIDER_INSET);
    const origDivider = findDividerRow(
      original,
      glass.left + inset,
      glass.right - inset,
      glass.top,
    );
    const capDivider = findDividerRow(
      capture,
      inset,
      capture.width - 1 - inset,
      0,
    );
    if (origDivider === null || capDivider === null) {
      return {
        ok: false,
        error:
          "Divider dell'header non trovato: allineamento impossibile. La cattura ritrae la stessa schermata? Se e' scrollata, passa --paste-y=N.",
      };
    }
    pasteY = origDivider - capDivider;
  }
  const required = glass.bottom - pasteY + 1;
  const dpr = glass.width / cssWidth;
  const cssHeight = Math.round(required / dpr);

  if (
    capture.height < required - HEIGHT_SLACK_UNDER ||
    capture.height > required + HEIGHT_SLACK_OVER
  ) {
    return {
      ok: false,
      error: `La cattura e' alta ${capture.height} px ma nel vetro ce ne stanno ${required}. Ricattura con viewport ${cssWidth}x${cssHeight} CSS px (deviceScaleFactor ${dpr.toFixed(4)}).`,
    };
  }

  return {
    ok: true,
    spans,
    glass,
    pasteX: glass.left,
    pasteY,
    required,
    dpr,
    cssHeight,
  };
}

/**
 * Incolla la cattura usando lo span per-riga come maschera, cosi' gli angoli
 * arrotondati restano quelli dell'originale. Un rettangolo li squadrerebbe.
 *
 * @param {Rgba} original @param {Rgba} capture
 * @param {Array<[number, number] | null>} spans
 * @param {number} pasteX @param {number} pasteY
 * @returns {Rgba}
 */
export function composite(original, capture, spans, pasteX, pasteY) {
  const out = {
    data: Uint8Array.from(original.data),
    width: original.width,
    height: original.height,
  };
  for (let j = 0; j < capture.height; j++) {
    const y = pasteY + j;
    if (y < 0 || y >= original.height) continue;
    const span = spans[y];
    if (!span) continue;
    for (let i = 0; i < capture.width; i++) {
      const x = pasteX + i;
      if (x < span[0] || x > span[1]) continue;
      const src = (j * capture.width + i) * 4;
      const dst = (y * original.width + x) * 4;
      out.data[dst] = capture.data[src];
      out.data[dst + 1] = capture.data[src + 1];
      out.data[dst + 2] = capture.data[src + 2];
      out.data[dst + 3] = capture.data[src + 3];
    }
  }
  return out;
}

/**
 * LA GUARDIA: quanti pixel cambiati cadono FUORI dal vetro.
 * Zero e' l'unico risultato accettabile — la cornice e la status bar non si
 * toccano. Confronta tutti e quattro i canali, senza tolleranza.
 *
 * @param {Rgba} original @param {Rgba} composed
 * @param {Array<[number, number] | null>} spans
 * @returns {{ outside: number, inside: number, sample: Array<{x:number,y:number}> }}
 */
export function frameDrift(original, composed, spans) {
  let outside = 0;
  let inside = 0;
  const sample = [];
  for (let y = 0; y < original.height; y++) {
    const span = spans[y];
    for (let x = 0; x < original.width; x++) {
      const i = (y * original.width + x) * 4;
      let changed = false;
      for (let c = 0; c < 4 && !changed; c++) {
        if (original.data[i + c] !== composed.data[i + c]) changed = true;
      }
      if (!changed) continue;
      if (span && x >= span[0] && x <= span[1]) inside++;
      else {
        outside++;
        if (sample.length < 5) sample.push({ x, y });
      }
    }
  }
  return { outside, inside, sample };
}

/* c8 ignore start -- guscio di I/O: la logica pura sopra e' testata a parte */
async function main() {
  const argv = process.argv.slice(2);
  const args = argv.filter((a) => !a.startsWith("--"));
  const inPlace = argv.includes("--in-place");
  const pasteYArg = argv.find((a) => a.startsWith("--paste-y="));
  const pasteY = pasteYArg
    ? Number(pasteYArg.slice("--paste-y=".length))
    : undefined;
  const [origPath, capPath, outArg] = args;
  const outPath = inPlace ? origPath : outArg;

  if (
    !origPath ||
    !capPath ||
    !outPath ||
    (pasteYArg && !Number.isFinite(pasteY))
  ) {
    console.error(
      "Uso: node scripts/compose-screenshot.mjs <originale.png> <cattura.png> <out.png>",
    );
    console.error(
      "     node scripts/compose-screenshot.mjs <originale.png> <cattura.png> --in-place",
    );
    console.error(
      "Opzioni: --paste-y=N   per una cattura scrollata, che non parte dall'header",
    );
    process.exit(1);
  }

  const { default: sharp } = await import("sharp");
  const load = async (p) => {
    const { data, info } = await sharp(p)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  };

  const original = await load(origPath);
  const capture = await load(capPath);

  const plan = planPaste(original, capture, { pasteY });
  if (!plan.ok) {
    console.error(`❌ ${plan.error}`);
    process.exit(1);
  }

  const composed = composite(
    original,
    capture,
    plan.spans,
    plan.pasteX,
    plan.pasteY,
  );
  const drift = frameDrift(original, composed, plan.spans);

  if (drift.outside > 0) {
    console.error(
      `❌ Cornice alterata: ${drift.outside} pixel cambiati fuori dal vetro.`,
    );
    console.error(
      `   Primi: ${drift.sample.map((p) => `(${p.x},${p.y})`).join(" ")}`,
    );
    console.error(
      "   Non scrivo nulla. La cornice e la status bar non si toccano.",
    );
    process.exit(1);
  }

  await sharp(Buffer.from(composed.data), {
    raw: { width: composed.width, height: composed.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(
    `✅ Composta in ${outPath} — ${composed.width}x${composed.height} RGBA`,
  );
  console.log(
    `   Vetro x ${plan.glass.left}..${plan.glass.right}, y ${plan.glass.top}..${plan.glass.bottom}`,
  );
  console.log(
    `   Incollata a y=${plan.pasteY} (viewport ${DEFAULT_CSS_WIDTH}x${plan.cssHeight} CSS px, DPR ${plan.dpr.toFixed(4)})`,
  );
  console.log(
    `   Cornice intatta: 0 pixel cambiati fuori dal vetro, ${drift.inside} dentro`,
  );
}

const isMain = process.argv[1]?.endsWith("compose-screenshot.mjs") === true;
if (isMain) {
  main().catch((err) => {
    console.error("❌ compose-screenshot:", err?.message ?? err);
    process.exit(1);
  });
}
/* c8 ignore stop */
