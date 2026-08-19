import { describe, expect, it } from "vitest";
import {
  PAYMENT_LABELS,
  formatBusinessAddressLines,
  formatReceiptPrice,
  formatReceiptDate,
  formatReceiptDateTime,
} from "./receipt-format";

describe("PAYMENT_LABELS", () => {
  // Dicitura del layout standard AdE: la riga della modalità di pagamento si
  // legge "Pagamento contante 160,00", non "Contante 160,00".
  it("usa la dicitura del layout AdE (Pagamento contante / elettronico)", () => {
    expect(PAYMENT_LABELS.PC).toBe("Pagamento contante");
    expect(PAYMENT_LABELS.PE).toBe("Pagamento elettronico");
  });
});

describe("formatReceiptPrice", () => {
  it("formatta in italiano senza simbolo €", () => {
    expect(formatReceiptPrice(12.5)).toBe("12,50");
    expect(formatReceiptPrice(0)).toBe("0,00");
  });

  it("forza 2 decimali anche per importi interi", () => {
    expect(formatReceiptPrice(5)).toBe("5,00");
  });

  it("arrotonda al secondo decimale", () => {
    expect(formatReceiptPrice(1.005)).toBe("1,01");
    expect(formatReceiptPrice(1.004)).toBe("1,00");
  });
});

describe("formatReceiptDateTime", () => {
  it("usa il formato DD-MM-YYYY HH:MM", () => {
    expect(formatReceiptDateTime(new Date("2026-01-15T09:05:00Z"))).toBe(
      "15-01-2026 10:05",
    );
  });

  it("rende l'ora legale italiana, non l'UTC del container", () => {
    // Luglio: Roma è UTC+2. Con getHours() in un container UTC stamperemmo 12:32.
    expect(formatReceiptDateTime(new Date("2026-07-28T12:32:00Z"))).toBe(
      "28-07-2026 14:32",
    );
  });

  it("non sbaglia il giorno a cavallo della mezzanotte italiana", () => {
    // 23:30 UTC del 27 = 01:30 del 28 a Roma: la data deve avanzare.
    expect(formatReceiptDateTime(new Date("2026-07-27T23:30:00Z"))).toBe(
      "28-07-2026 01:30",
    );
  });
});

describe("formatBusinessAddressLines", () => {
  it("rende via e località su due righe, con la provincia fra parentesi", () => {
    expect(
      formatBusinessAddressLines({
        address: "Via Roma 1",
        city: "Milano",
        province: "MI",
        zipCode: "20100",
      }),
    ).toEqual(["Via Roma 1", "Milano(MI), 20100"]);
  });

  it("omette la riga via quando l'indirizzo manca", () => {
    expect(
      formatBusinessAddressLines({
        address: null,
        city: "Milano",
        province: "MI",
        zipCode: "20100",
      }),
    ).toEqual(["Milano(MI), 20100"]);
  });

  it("omette le parentesi quando la provincia manca", () => {
    expect(
      formatBusinessAddressLines({
        address: "Via Roma 1",
        city: "Milano",
        province: null,
        zipCode: "20100",
      }),
    ).toEqual(["Via Roma 1", "Milano, 20100"]);
  });

  it("omette il CAP quando manca", () => {
    expect(
      formatBusinessAddressLines({
        address: null,
        city: "Milano",
        province: "MI",
        zipCode: null,
      }),
    ).toEqual(["Milano(MI)"]);
  });

  it("senza città non stampa una provincia orfana fra parentesi", () => {
    expect(
      formatBusinessAddressLines({
        address: "Via Roma 1",
        city: null,
        province: "MI",
        zipCode: "20100",
      }),
    ).toEqual(["Via Roma 1", "20100"]);
  });

  it("restituisce un array vuoto quando non c'è alcun dato indirizzo", () => {
    expect(
      formatBusinessAddressLines({
        address: null,
        city: null,
        province: null,
        zipCode: null,
      }),
    ).toEqual([]);
  });

  it("ignora i campi composti da soli spazi", () => {
    expect(
      formatBusinessAddressLines({
        address: "   ",
        city: "Milano",
        province: "  ",
        zipCode: "20100",
      }),
    ).toEqual(["Milano, 20100"]);
  });
});

describe("formatReceiptDate", () => {
  // Il blocco "Documento di riferimento" del layout di annullo cita la sola
  // data della vendita (`del 03-06-2020`), senza ora.
  it("rende solo la data, in formato DD-MM-YYYY", () => {
    expect(formatReceiptDate(new Date("2026-02-15T12:30:00Z"))).toBe(
      "15-02-2026",
    );
  });

  it("usa l'ora italiana, non l'UTC del container", () => {
    // 23:30 UTC del 31/12 è già l'1 gennaio a Roma (CET, +1).
    expect(formatReceiptDate(new Date("2026-12-31T23:30:00Z"))).toBe(
      "01-01-2027",
    );
  });

  it("regge l'ora legale (CEST, +2)", () => {
    // 22:30 UTC del 15/07 è il 16 luglio a Roma.
    expect(formatReceiptDate(new Date("2026-07-15T22:30:00Z"))).toBe(
      "16-07-2026",
    );
  });
});
