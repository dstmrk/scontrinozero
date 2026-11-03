import { act, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { NumericKeypad } from "./numeric-keypad";

const LABEL = "Importo";

type KeypadProps = Parameters<typeof NumericKeypad>[0];

function renderKeypad(overrides: Partial<KeypadProps> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <NumericKeypad
      value={0}
      onChange={onChange}
      aria-label={LABEL}
      {...overrides}
    />,
  );
  return { onChange, ...utils };
}

function toolbar(): HTMLElement {
  return screen.getByRole("toolbar", { name: LABEL });
}

/**
 * Stub di `matchMedia` che risponde `matches` solo alla query esatta
 * `(pointer: fine)`: così il test verifica anche quale query il componente
 * interroga, non solo che la interroghi.
 */
function stubPointer(fine: boolean) {
  const mockMatchMedia = vi.fn((query: string) => ({
    matches: query === "(pointer: fine)" ? fine : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("matchMedia", mockMatchMedia);
  return mockMatchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("NumericKeypad", () => {
  it("renderizza tutti i tasti numerici 0-9", () => {
    renderKeypad();

    for (let i = 0; i <= 9; i++) {
      expect(
        screen.getByRole("button", { name: String(i) }),
      ).toBeInTheDocument();
    }
  });

  it("renderizza il tasto 00", () => {
    renderKeypad();
    expect(screen.getByRole("button", { name: "00" })).toBeInTheDocument();
  });

  it("renderizza il tasto backspace", () => {
    renderKeypad();
    expect(
      screen.getByRole("button", { name: /backspace|⌫|cancella/i }),
    ).toBeInTheDocument();
  });

  it.each([
    {
      name: "chiama onChange con centesimi corretti premendo una cifra (0 → 7 = 7)",
      value: 0,
      button: "7",
      expected: 7,
    },
    {
      name: "aggiunge cifra al valore esistente cashier-style (13 → '5' = 135)",
      value: 13,
      button: "5",
      expected: 135,
    },
    {
      name: "chiama onChange con backspace cashier-style (1358 → 135)",
      value: 1358,
      button: /backspace|⌫|cancella/i,
      expected: 135,
    },
    {
      name: "backspace su 0 rimane 0",
      value: 0,
      button: /backspace|⌫|cancella/i,
      expected: 0,
    },
    {
      name: "tasto 00 aggiunge due zeri (5 → 500)",
      value: 5,
      button: "00",
      expected: 500,
    },
    { name: "tasto 00 su 0 rimane 0", value: 0, button: "00", expected: 0 },
    {
      name: "non supera il massimo di 999999 centesimi",
      value: 999999,
      button: "1",
      expected: 999999,
    },
    {
      name: "aggiunge zero premendo il tasto 0 (10 → 100)",
      value: 10,
      button: "0",
      expected: 100,
    },
  ] as {
    name: string;
    value: number;
    button: string | RegExp;
    expected: number;
  }[])("$name", ({ value, button, expected }) => {
    const { onChange } = renderKeypad({ value });

    fireEvent.click(screen.getByRole("button", { name: button }));

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("sequenza 1→3→5→8 produce 1358 centesimi (€13,58)", () => {
    const results: number[] = [];
    const onChange = vi.fn().mockImplementation((v: number) => results.push(v));

    const { rerender } = render(
      <NumericKeypad value={0} onChange={onChange} aria-label={LABEL} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "1" }));

    rerender(
      <NumericKeypad value={1} onChange={onChange} aria-label={LABEL} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "3" }));

    rerender(
      <NumericKeypad value={13} onChange={onChange} aria-label={LABEL} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    rerender(
      <NumericKeypad value={135} onChange={onChange} aria-label={LABEL} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "8" }));

    expect(results).toEqual([1, 13, 135, 1358]);
  });
});

describe("NumericKeypad — contenitore accessibile", () => {
  it("espone una toolbar con l'aria-label passata", () => {
    renderKeypad();

    expect(toolbar()).toBeInTheDocument();
  });

  it("la toolbar è raggiungibile da tastiera (tabIndex 0)", () => {
    renderKeypad();

    expect(toolbar()).toHaveAttribute("tabindex", "0");
  });

  it("la toolbar contiene i tasti del tastierino", () => {
    renderKeypad();

    expect(toolbar()).toContainElement(
      screen.getByRole("button", { name: "7" }),
    );
  });

  it("due tastierini con label diverse sono distinguibili", () => {
    render(
      <>
        <NumericKeypad value={0} onChange={vi.fn()} aria-label="Importo" />
        <NumericKeypad value={0} onChange={vi.fn()} aria-label="Contanti" />
      </>,
    );

    expect(
      screen.getByRole("toolbar", { name: "Importo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("toolbar", { name: "Contanti" }),
    ).toBeInTheDocument();
  });
});

describe("NumericKeypad — tastiera fisica: cifre", () => {
  it.each(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"])(
    "il tasto '%s' appende la cifra come il click (12 → 12%s)",
    (digit) => {
      const { onChange } = renderKeypad({ value: 12 });

      fireEvent.keyDown(toolbar(), { key: digit });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(12 * 10 + Number(digit));
    },
  );

  it("parte da zero: '7' su 0 dà 7 centesimi", () => {
    const { onChange } = renderKeypad({ value: 0 });

    fireEvent.keyDown(toolbar(), { key: "7" });

    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("rispetta il tetto di 999999 centesimi", () => {
    const { onChange } = renderKeypad({ value: 999999 });

    fireEvent.keyDown(toolbar(), { key: "1" });

    // Stesso risultato del click: il valore resta al tetto, mai oltre.
    expect(onChange.mock.calls.every(([cents]) => cents === 999999)).toBe(true);
  });

  it("funziona anche col focus su un bottone figlio (bubbling)", () => {
    const { onChange } = renderKeypad({ value: 4 });

    fireEvent.keyDown(screen.getByRole("button", { name: "7" }), {
      key: "3",
    });

    expect(onChange).toHaveBeenCalledWith(43);
  });

  it("la sequenza 1, 2, ',', 5, 0 produce 1250 centesimi", () => {
    // Il separatore si ignora come sul tastierino: digitare "12,50" deve dare
    // €12,50 e non €1,25 o un errore.
    const results: number[] = [];
    let current = 0;
    const onChange = vi.fn((v: number) => {
      results.push(v);
      current = v;
    });
    const { rerender } = render(
      <NumericKeypad value={current} onChange={onChange} aria-label={LABEL} />,
    );

    for (const key of ["1", "2", ",", "5", "0"]) {
      fireEvent.keyDown(toolbar(), { key });
      rerender(
        <NumericKeypad
          value={current}
          onChange={onChange}
          aria-label={LABEL}
        />,
      );
    }

    expect(current).toBe(1250);
    expect(results).toEqual([1, 12, 125, 1250]);
  });
});

describe("NumericKeypad — tastiera fisica: separatori e cancellazione", () => {
  it.each([",", "."])("il separatore '%s' è ignorato", (key) => {
    const { onChange } = renderKeypad({ value: 12 });

    fireEvent.keyDown(toolbar(), { key });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("Backspace toglie l'ultima cifra (1358 → 135)", () => {
    const { onChange } = renderKeypad({ value: 1358 });

    fireEvent.keyDown(toolbar(), { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith(135);
  });

  it("Backspace su 0 resta 0", () => {
    const { onChange } = renderKeypad({ value: 0 });

    fireEvent.keyDown(toolbar(), { key: "Backspace" });

    expect(onChange.mock.calls.every(([cents]) => cents === 0)).toBe(true);
  });

  it("Delete azzera l'importo", () => {
    const { onChange } = renderKeypad({ value: 1234 });

    fireEvent.keyDown(toolbar(), { key: "Delete" });

    expect(onChange).toHaveBeenCalledWith(0);
  });
});

describe("NumericKeypad — tastiera fisica: Enter ed Escape", () => {
  it("Enter chiama onSubmit", () => {
    const onSubmit = vi.fn();
    const { onChange } = renderKeypad({ value: 500, onSubmit });

    fireEvent.keyDown(toolbar(), { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Enter con onSubmit previene il default", () => {
    renderKeypad({ onSubmit: vi.fn() });

    // false = preventDefault() chiamato.
    expect(fireEvent.keyDown(toolbar(), { key: "Enter" })).toBe(false);
  });

  it("Enter su un bottone-cifra chiama onSubmit e previene il riclick", () => {
    // Senza preventDefault il browser trasformerebbe l'Enter in un click sul
    // bottone col focus, appendendo di nuovo la cifra prima di confermare.
    const onSubmit = vi.fn();
    renderKeypad({ value: 5, onSubmit });

    const notPrevented = fireEvent.keyDown(
      screen.getByRole("button", { name: "5" }),
      { key: "Enter" },
    );

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it("Enter senza onSubmit non fa nulla e non previene il default", () => {
    const { onChange } = renderKeypad({ value: 500 });

    const notPrevented = fireEvent.keyDown(toolbar(), { key: "Enter" });

    expect(notPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape chiama onCancel", () => {
    const onCancel = vi.fn();
    const { onChange } = renderKeypad({ value: 500, onCancel });

    fireEvent.keyDown(toolbar(), { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape senza onCancel non lancia e non cambia l'importo", () => {
    const { onChange } = renderKeypad({ value: 500 });

    fireEvent.keyDown(toolbar(), { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape non chiama onSubmit, Enter non chiama onCancel", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    renderKeypad({ value: 500, onSubmit, onCancel });

    fireEvent.keyDown(toolbar(), { key: "Escape" });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(toolbar(), { key: "Enter" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("NumericKeypad — modificatori e tasti non gestiti", () => {
  it.each([
    { label: "Ctrl+1", key: "1", mod: { ctrlKey: true } },
    { label: "Cmd+1", key: "1", mod: { metaKey: true } },
    { label: "Alt+1", key: "1", mod: { altKey: true } },
    { label: "Cmd+Backspace", key: "Backspace", mod: { metaKey: true } },
    { label: "Ctrl+Backspace", key: "Backspace", mod: { ctrlKey: true } },
    { label: "Alt+Delete", key: "Delete", mod: { altKey: true } },
  ])("$label è ignorato e non previene il default", ({ key, mod }) => {
    const { onChange } = renderKeypad({ value: 1234 });

    const notPrevented = fireEvent.keyDown(toolbar(), { key, ...mod });

    expect(onChange).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it("Ctrl+Enter non chiama onSubmit", () => {
    const onSubmit = vi.fn();
    renderKeypad({ value: 500, onSubmit });

    fireEvent.keyDown(toolbar(), { key: "Enter", ctrlKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Cmd+Escape non chiama onCancel", () => {
    const onCancel = vi.fn();
    renderKeypad({ value: 500, onCancel });

    fireEvent.keyDown(toolbar(), { key: "Escape", metaKey: true });

    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each(["5", "Backspace", "Delete"])(
    "il tasto gestito '%s' previene il default",
    (key) => {
      renderKeypad({ value: 12 });

      expect(fireEvent.keyDown(toolbar(), { key })).toBe(false);
    },
  );

  it.each(["a", "Tab", "ArrowLeft", " "])(
    "il tasto non gestito '%s' non cambia nulla né previene il default",
    (key) => {
      const { onChange } = renderKeypad({ value: 12 });

      const notPrevented = fireEvent.keyDown(toolbar(), { key });

      expect(notPrevented).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
    },
  );
});

describe("NumericKeypad — nessun listener globale", () => {
  it("un keydown su document.body non chiama onChange", () => {
    const { onChange } = renderKeypad({ value: 12 });

    fireEvent.keyDown(document.body, { key: "5" });
    fireEvent.keyDown(document.body, { key: "Backspace" });
    fireEvent.keyDown(document.body, { key: "Delete" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("un keydown su un campo fuori dal tastierino non chiama onChange né onSubmit", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <div>
        <input aria-label="Descrizione" />
        <NumericKeypad
          value={12}
          onChange={onChange}
          onSubmit={onSubmit}
          onCancel={onCancel}
          aria-label={LABEL}
        />
      </div>,
    );
    const input = screen.getByRole("textbox", { name: "Descrizione" });

    for (const key of ["5", "Backspace", "Delete", "Enter", "Escape"]) {
      fireEvent.keyDown(input, { key });
    }

    expect(onChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("un keydown su window non chiama onChange", () => {
    const { onChange } = renderKeypad({ value: 12 });

    fireEvent.keyDown(window, { key: "5" });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("NumericKeypad — feedback visivo del tasto fisico", () => {
  it("la cifra premuta marca il suo bottone con data-pressed per 120 ms", () => {
    vi.useFakeTimers();
    renderKeypad({ value: 0 });
    const button = screen.getByRole("button", { name: "5" });

    expect(button).not.toHaveAttribute("data-pressed", "true");

    fireEvent.keyDown(toolbar(), { key: "5" });
    expect(button).toHaveAttribute("data-pressed", "true");

    act(() => {
      vi.advanceTimersByTime(119);
    });
    expect(button).toHaveAttribute("data-pressed", "true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(button).not.toHaveAttribute("data-pressed", "true");
  });

  it("marca solo il bottone corrispondente", () => {
    vi.useFakeTimers();
    renderKeypad({ value: 0 });

    fireEvent.keyDown(toolbar(), { key: "0" });

    // "0" e non "00": il tasto fisico è una cifra sola.
    expect(screen.getByRole("button", { name: "0" })).toHaveAttribute(
      "data-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "00" })).not.toHaveAttribute(
      "data-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "5" })).not.toHaveAttribute(
      "data-pressed",
      "true",
    );
  });

  it("Backspace marca il bottone ⌫", () => {
    vi.useFakeTimers();
    renderKeypad({ value: 12 });
    const backspace = screen.getByRole("button", { name: "⌫" });

    fireEvent.keyDown(toolbar(), { key: "Backspace" });
    expect(backspace).toHaveAttribute("data-pressed", "true");

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(backspace).not.toHaveAttribute("data-pressed", "true");
  });

  it("un tasto ignorato non marca nessun bottone", () => {
    vi.useFakeTimers();
    renderKeypad({ value: 12 });

    fireEvent.keyDown(toolbar(), { key: "5", ctrlKey: true });

    expect(screen.getByRole("button", { name: "5" })).not.toHaveAttribute(
      "data-pressed",
      "true",
    );
  });

  it("smontare prima dei 120 ms non lancia né logga errori", () => {
    vi.useFakeTimers();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { unmount } = renderKeypad({ value: 0 });

    fireEvent.keyDown(toolbar(), { key: "5" });
    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }).not.toThrow();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("NumericKeypad — autoFocus", () => {
  it("con pointer fine prende il focus al mount", () => {
    const mockMatchMedia = stubPointer(true);
    renderKeypad({ autoFocus: true });

    expect(toolbar()).toHaveFocus();
    expect(mockMatchMedia).toHaveBeenCalledWith("(pointer: fine)");
  });

  it("su touch (pointer non fine) non prende il focus", () => {
    stubPointer(false);
    renderKeypad({ autoFocus: true });

    expect(toolbar()).not.toHaveFocus();
  });

  it("senza matchMedia (jsdom di default) non prende il focus e non lancia", () => {
    // Precondizione: jsdom non implementa matchMedia.
    expect(window.matchMedia).toBeUndefined();

    renderKeypad({ autoFocus: true });

    expect(toolbar()).not.toHaveFocus();
  });

  it("senza autoFocus non prende mai il focus, anche con pointer fine", () => {
    stubPointer(true);
    renderKeypad();

    expect(toolbar()).not.toHaveFocus();
  });
});
