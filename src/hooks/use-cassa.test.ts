import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCassa } from "@/hooks/use-cassa";

// Mock crypto.randomUUID per avere id deterministici nei test
let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

beforeEach(() => {
  uuidCounter = 0;
});

describe("useCassa", () => {
  it("inizia con carrello vuoto", () => {
    const { result } = renderHook(() => useCassa());
    expect(result.current.lines).toEqual([]);
  });

  it("inizia con paymentMethod PC (contanti)", () => {
    const { result } = renderHook(() => useCassa());
    expect(result.current.paymentMethod).toBe("PC");
  });

  it("inizia con totale zero", () => {
    const { result } = renderHook(() => useCassa());
    expect(result.current.total).toBe(0);
  });

  it("addLine aggiunge una riga con id generato", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "Caffè",
        quantity: 1,
        grossUnitPrice: 1.2,
        vatCode: "22",
      });
    });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatchObject({
      id: "test-uuid-1",
      description: "Caffè",
      quantity: 1,
      grossUnitPrice: 1.2,
      vatCode: "22",
    });
  });

  it("addLine aggiunge più righe mantenendo le precedenti", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "Caffè",
        quantity: 1,
        grossUnitPrice: 1.2,
        vatCode: "22",
      });
      result.current.addLine({
        description: "Cornetto",
        quantity: 2,
        grossUnitPrice: 1.5,
        vatCode: "10",
      });
    });

    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines[0].description).toBe("Caffè");
    expect(result.current.lines[1].description).toBe("Cornetto");
  });

  it("addLine assegna id univoci alle righe", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "A",
        quantity: 1,
        grossUnitPrice: 1,
        vatCode: "22",
      });
      result.current.addLine({
        description: "B",
        quantity: 1,
        grossUnitPrice: 1,
        vatCode: "22",
      });
    });

    expect(result.current.lines[0].id).not.toBe(result.current.lines[1].id);
  });

  it("removeLine rimuove la riga con l'id specificato", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "Caffè",
        quantity: 1,
        grossUnitPrice: 1.2,
        vatCode: "22",
      });
    });
    const id = result.current.lines[0].id;

    act(() => {
      result.current.removeLine(id);
    });

    expect(result.current.lines).toHaveLength(0);
  });

  it("removeLine lascia le altre righe intatte", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "A",
        quantity: 1,
        grossUnitPrice: 1,
        vatCode: "22",
      });
      result.current.addLine({
        description: "B",
        quantity: 1,
        grossUnitPrice: 2,
        vatCode: "22",
      });
    });
    const firstId = result.current.lines[0].id;

    act(() => {
      result.current.removeLine(firstId);
    });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0].description).toBe("B");
  });

  it("removeLine su id inesistente non cambia lo stato", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "Caffè",
        quantity: 1,
        grossUnitPrice: 1.2,
        vatCode: "22",
      });
    });

    act(() => {
      result.current.removeLine("id-non-esiste");
    });

    expect(result.current.lines).toHaveLength(1);
  });

  it("clearCart svuota il carrello", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "A",
        quantity: 1,
        grossUnitPrice: 1,
        vatCode: "22",
      });
      result.current.addLine({
        description: "B",
        quantity: 1,
        grossUnitPrice: 2,
        vatCode: "22",
      });
    });

    act(() => {
      result.current.clearCart();
    });

    expect(result.current.lines).toHaveLength(0);
  });

  it("calcola il totale correttamente con una riga", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "Pizza",
        quantity: 2,
        grossUnitPrice: 8.5,
        vatCode: "10",
      });
    });

    expect(result.current.total).toBeCloseTo(17, 5);
  });

  it("calcola il totale correttamente con più righe", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "Caffè",
        quantity: 1,
        grossUnitPrice: 1.2,
        vatCode: "22",
      });
      result.current.addLine({
        description: "Cornetto",
        quantity: 2,
        grossUnitPrice: 1.5,
        vatCode: "10",
      });
    });

    // 1.20 + 2×1.50 = 1.20 + 3.00 = 4.20
    expect(result.current.total).toBeCloseTo(4.2, 5);
  });

  it("il totale si aggiorna dopo removeLine", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "A",
        quantity: 1,
        grossUnitPrice: 10,
        vatCode: "22",
      });
      result.current.addLine({
        description: "B",
        quantity: 1,
        grossUnitPrice: 5,
        vatCode: "22",
      });
    });
    const firstId = result.current.lines[0].id;

    act(() => {
      result.current.removeLine(firstId);
    });

    expect(result.current.total).toBeCloseTo(5, 5);
  });

  it("setPaymentMethod aggiorna il metodo di pagamento", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.setPaymentMethod("PE");
    });

    expect(result.current.paymentMethod).toBe("PE");
  });

  it("il totale è zero dopo clearCart", () => {
    const { result } = renderHook(() => useCassa());

    act(() => {
      result.current.addLine({
        description: "A",
        quantity: 1,
        grossUnitPrice: 10,
        vatCode: "22",
      });
    });

    act(() => {
      result.current.clearCart();
    });

    expect(result.current.total).toBe(0);
  });
});
