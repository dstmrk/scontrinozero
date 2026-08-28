import { describe, it, expect } from "vitest";
import {
  glassSpans,
  glassBounds,
  findDividerRow,
  planPaste,
  composite,
  frameDrift,
} from "../../../scripts/compose-screenshot.mjs";

type Rgba = { data: Uint8Array; width: number; height: number };
type Color = [number, number, number, number];

const TRANSPARENT: Color = [0, 0, 0, 0];
const BEZEL: Color = [40, 40, 40, 255];
const WHITE: Color = [255, 255, 255, 255];
const DIVIDER: Color = [229, 229, 229, 255];
const DIVIDER_LIGHT: Color = [245, 245, 245, 255];
const TEXT: Color = [20, 20, 20, 255];

function blank(width: number, height: number, color: Color): Rgba {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(color, i * 4);
  return { data, width, height };
}

function fill(
  img: Rgba,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Color,
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) img.data.set(c, (y * img.width + x) * 4);
  }
}

/**
 * Un "telefono" sintetico: margine trasparente, bezel scuro, vetro bianco con
 * angoli rientranti sulla prima e sull'ultima riga, un divider a due righe
 * sotto l'header e del testo scuro più in basso (che una scansione dal centro
 * scambierebbe per bezel).
 * Vetro: x 20..99 (80 px), y 10..69. Divider più scuro a y=20.
 */
function makeOriginal(): Rgba {
  const img = blank(120, 80, TRANSPARENT);
  fill(img, 10, 5, 109, 74, BEZEL);
  fill(img, 20, 10, 99, 69, WHITE);
  fill(img, 30, 10, 89, 10, WHITE); // angoli: prima riga più stretta
  fill(img, 20, 10, 29, 10, BEZEL);
  fill(img, 90, 10, 99, 10, BEZEL);
  fill(img, 20, 69, 29, 69, BEZEL); // ultima riga più stretta
  fill(img, 90, 69, 99, 69, BEZEL);
  fill(img, 20, 19, 99, 19, DIVIDER_LIGHT);
  fill(img, 20, 20, 99, 20, DIVIDER); // la più scura del gruppo
  fill(img, 55, 30, 64, 34, TEXT);
  return img;
}

/** La cattura: larga quanto il vetro, con il proprio divider a y=5. */
function makeCapture(height: number): Rgba {
  const img = blank(80, height, WHITE);
  fill(img, 0, 5, 79, 5, DIVIDER);
  fill(img, 30, 20, 49, 24, TEXT);
  return img;
}

describe("glassSpans", () => {
  it("trova il vetro e lo distingue da bezel e trasparenza", () => {
    const spans = glassSpans(makeOriginal());
    expect(spans[40]).toEqual([20, 99]);
    expect(spans[0]).toBeNull();
    expect(spans[79]).toBeNull();
  });

  it("non si fa ingannare dal testo scuro dentro il vetro", () => {
    const spans = glassSpans(makeOriginal());
    expect(spans[32]).toEqual([20, 99]);
  });

  it("segue gli angoli arrotondati invece di squadrarli", () => {
    const spans = glassSpans(makeOriginal());
    expect(spans[10]).toEqual([30, 89]);
  });
});

describe("glassBounds", () => {
  it("misura il rettangolo sulla riga più larga, fuori dagli angoli", () => {
    const bounds = glassBounds(glassSpans(makeOriginal()));
    expect(bounds).toEqual({
      top: 10,
      bottom: 69,
      left: 20,
      right: 99,
      width: 80,
    });
  });

  it("torna null su un'immagine senza vetro", () => {
    expect(glassBounds(glassSpans(blank(120, 80, BEZEL)))).toBeNull();
  });
});

describe("findDividerRow", () => {
  it("prende la riga più scura del primo gruppo grigio", () => {
    expect(findDividerRow(makeOriginal(), 24, 95, 10)).toBe(20);
  });

  it("torna null quando non c'è nessun divider", () => {
    expect(findDividerRow(blank(80, 40, WHITE), 4, 75, 0)).toBeNull();
  });
});

describe("planPaste", () => {
  it("deriva l'offset verticale dai due divider", () => {
    const plan = planPaste(makeOriginal(), makeCapture(55), { cssWidth: 80 });
    expect(plan).toMatchObject({
      ok: true,
      pasteX: 20,
      pasteY: 15,
      required: 55,
    });
  });

  it("calcola il viewport da usare per la cattura", () => {
    const plan = planPaste(makeOriginal(), makeCapture(55), { cssWidth: 80 });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.cssHeight).toBe(55);
    expect(plan.dpr).toBeCloseTo(1, 5);
  });

  it("rifiuta una cattura larga male e dice la larghezza giusta", () => {
    const plan = planPaste(
      makeOriginal(),
      makeCapture(55) && blank(60, 55, WHITE),
      {
        cssWidth: 80,
      },
    );
    if (plan.ok) throw new Error("doveva rifiutare la larghezza sbagliata");
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain("80");
  });

  it("rifiuta una cattura alta male e dice a che viewport ricatturare", () => {
    const plan = planPaste(makeOriginal(), makeCapture(90), { cssWidth: 80 });
    if (plan.ok) throw new Error("doveva rifiutare l'altezza sbagliata");
    expect(plan.ok).toBe(false);
    expect(plan.error).toContain("80x55");
  });

  it("tollera lo scarto di arrotondamento del DPR", () => {
    expect(
      planPaste(makeOriginal(), makeCapture(56), { cssWidth: 80 }).ok,
    ).toBe(true);
  });
});

describe("planPaste con --paste-y (catture scrollate)", () => {
  it("usa l'offset dato e ignora del tutto il divider", () => {
    // a y=20 il vetro (che finisce a 69) ne vuole 50, non 55
    const plan = planPaste(makeOriginal(), makeCapture(50), {
      cssWidth: 80,
      pasteY: 20,
    });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.pasteY).toBe(20);
    expect(plan.required).toBe(50);
  });

  it("compone una cattura senza divider, che altrimenti sarebbe rifiutata", () => {
    const senzaDivider = blank(80, 55, WHITE);
    const rifiutata = planPaste(makeOriginal(), senzaDivider, { cssWidth: 80 });
    expect(rifiutata.ok).toBe(false);

    const conOverride = planPaste(makeOriginal(), senzaDivider, {
      cssWidth: 80,
      pasteY: 15,
    });
    expect(conOverride.ok).toBe(true);
  });

  it("suggerisce --paste-y quando l'allineamento fallisce", () => {
    const plan = planPaste(makeOriginal(), blank(80, 55, WHITE), {
      cssWidth: 80,
    });
    if (plan.ok) throw new Error("doveva rifiutare una cattura senza divider");
    expect(plan.error).toContain("--paste-y");
  });

  it("verifica comunque l'altezza rispetto all'offset dato", () => {
    const plan = planPaste(makeOriginal(), makeCapture(55), {
      cssWidth: 80,
      pasteY: 5,
    });
    if (plan.ok)
      throw new Error("doveva rifiutare: a y=5 il vetro ne vuole 65");
    expect(plan.error).toContain("65");
  });
});

describe("composite", () => {
  it("scrive dentro il vetro", () => {
    const original = makeOriginal();
    const plan = planPaste(original, makeCapture(55), { cssWidth: 80 });
    if (!plan.ok) throw new Error(plan.error);
    const out = composite(
      original,
      makeCapture(55),
      plan.spans,
      plan.pasteX,
      plan.pasteY,
    );
    // il testo della cattura (x 30..49, y 20..24) finisce a x 50..69, y 35..39
    const i = (37 * out.width + 55) * 4;
    expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([
      20, 20, 20,
    ]);
  });

  it("lascia intatti gli angoli arrotondati", () => {
    const original = makeOriginal();
    const plan = planPaste(original, makeCapture(55), { cssWidth: 80 });
    if (!plan.ok) throw new Error(plan.error);
    const out = composite(
      original,
      makeCapture(55),
      plan.spans,
      plan.pasteX,
      plan.pasteY,
    );
    const i = (69 * out.width + 22) * 4; // bezel dell'angolo in basso a sinistra
    expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([
      40, 40, 40,
    ]);
  });
});

describe("frameDrift", () => {
  it("non segnala nulla fuori dal vetro su una composizione legittima", () => {
    const original = makeOriginal();
    const plan = planPaste(original, makeCapture(55), { cssWidth: 80 });
    if (!plan.ok) throw new Error(plan.error);
    const out = composite(
      original,
      makeCapture(55),
      plan.spans,
      plan.pasteX,
      plan.pasteY,
    );
    const drift = frameDrift(original, out, plan.spans);
    expect(drift.outside).toBe(0);
    expect(drift.inside).toBeGreaterThan(0);
  });

  it("intercetta un pixel di cornice alterato — è la guardia, non un log", () => {
    const original = makeOriginal();
    const plan = planPaste(original, makeCapture(55), { cssWidth: 80 });
    if (!plan.ok) throw new Error(plan.error);
    const out = composite(
      original,
      makeCapture(55),
      plan.spans,
      plan.pasteX,
      plan.pasteY,
    );
    out.data.set([255, 0, 0, 255], (7 * out.width + 60) * 4); // bezel in alto
    const drift = frameDrift(original, out, plan.spans);
    expect(drift.outside).toBe(1);
    expect(drift.sample[0]).toEqual({ x: 60, y: 7 });
  });
});
