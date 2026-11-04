"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { Delete } from "lucide-react";
import { appendDigitCents, backspaceCents, cn } from "@/lib/utils";

/** Ciò che un altro controllo della cassa può chiedere al tastierino. */
export interface NumericKeypadHandle {
  /** Porta il focus sulla toolbar, così la tastiera fisica scrive qui. */
  focus: () => void;
}

interface NumericKeypadProps {
  readonly ref?: Ref<NumericKeypadHandle>;
  /**
   * Il display del valore. Sta dentro la toolbar perché display e tasti sono
   * un campo solo: il clic sul display gli dà il focus (come un `<label>` col
   * suo input) e l'anello di focus li racchiude entrambi.
   */
  readonly display?: ReactNode;
  readonly value: number; // centesimi
  readonly onChange: (value: number) => void;
  /** Nome della toolbar per lo screen reader: in cassa convivono più tastierini. */
  readonly "aria-label": string;
  /** Prende il focus al mount, ma solo con un puntatore preciso (desktop). */
  readonly autoFocus?: boolean;
  /** Invio dalla tastiera fisica. Assente: Invio non fa nulla. */
  readonly onSubmit?: () => void;
  /** Esc dalla tastiera fisica. */
  readonly onCancel?: () => void;
}

const KEYS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
] as const;

const BACKSPACE_LABEL = "⌫";

/** Durata dell'evidenziazione del tasto a schermo dopo un tasto fisico. */
export const KEY_FLASH_MS = 120;

const DIGIT_RE = /^\d$/;

/**
 * Tastierino in centesimi "cashier-style". Accetta anche la tastiera fisica,
 * ma solo quando il focus è dentro il tastierino: in cassa possono essercene
 * due a schermo (importo + sconto di riga, sconto a pagare + contanti), e un
 * listener globale non saprebbe a quale mandare le cifre — né distinguerebbe
 * la cifra scritta nel campo descrizione. La virgola si ignora: con la
 * semantica a centesimi "12,50" e "1250" danno lo stesso importo.
 */
export function NumericKeypad({
  ref,
  display,
  value,
  onChange,
  "aria-label": ariaLabel,
  autoFocus = false,
  onSubmit,
  onCancel,
}: NumericKeypadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Su touch il focus non serve (nessuna tastiera fisica) e lascerebbe un
    // anello di focus senza motivo; jsdom e browser vecchi non hanno matchMedia.
    if (!autoFocus || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(pointer: fine)").matches) {
      containerRef.current?.focus({ preventScroll: true });
    }
  }, [autoFocus]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => containerRef.current?.focus({ preventScroll: true }),
    }),
    [],
  );

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const flash = (key: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setPressedKey(key);
    flashTimer.current = setTimeout(() => setPressedKey(null), KEY_FLASH_MS);
  };

  const handleDigit = (digit: string) => {
    onChange(appendDigitCents(value, digit));
  };

  const handle00 = () => {
    onChange(appendDigitCents(appendDigitCents(value, "0"), "0"));
  };

  const handleBackspace = () => {
    onChange(backspaceCents(value));
  };

  // Un clic dentro il tastierino ci porta il focus se è ancora altrove: sul
  // display, che non è un controllo, e sui tasti in Safari macOS, che al clic
  // non dà il focus ai bottoni. Se il focus è già dentro (un tasto, in Chrome)
  // non lo si sposta.
  const handleClick = () => {
    const container = containerRef.current;
    if (container && !container.contains(document.activeElement)) {
      container.focus({ preventScroll: true });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Ctrl/Cmd/Alt + tasto appartengono al browser (Ctrl+1 cambia scheda).
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (DIGIT_RE.test(e.key)) {
      e.preventDefault();
      handleDigit(e.key);
      flash(e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      handleBackspace();
      flash(BACKSPACE_LABEL);
    } else if (e.key === "Delete") {
      e.preventDefault();
      onChange(0);
    } else if (e.key === "Enter" && onSubmit) {
      // Senza preventDefault, Invio col focus su un tasto cifra (dopo un
      // click) lo "riclicca" prima di confermare.
      e.preventDefault();
      onSubmit();
    } else if (e.key === "Escape" && onCancel) {
      onCancel();
    }
  };

  return (
    // `toolbar` e non `group`: è il ruolo ARIA del contenitore di controlli
    // che riceve il focus e gestisce la tastiera. `group` è strutturale, e un
    // elemento strutturale focusabile con keydown è proprio ciò che le regole
    // jsx-a11y (Sonar S6847, S6845, S6819) segnalano. I tasti figli restano
    // raggiungibili con Tab.
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      className={cn(
        "rounded-xl outline-none",
        "pointer-fine:focus-within:ring-ring pointer-fine:focus-within:ring-2 pointer-fine:focus-within:ring-offset-2",
      )}
    >
      {display !== undefined && (
        <div className="pointer-fine:cursor-pointer">{display}</div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((row, rowIdx) =>
          row.map((key, colIdx) => (
            <KeyButton
              key={`${rowIdx}-${colIdx}`}
              label={key}
              pressed={pressedKey === key}
              onClick={() => handleDigit(key)}
            />
          )),
        )}

        {/* Bottom row: 00 | 0 | backspace */}
        <KeyButton label="00" onClick={handle00} aria-label="00" />
        <KeyButton
          label="0"
          pressed={pressedKey === "0"}
          onClick={() => handleDigit("0")}
        />
        <KeyButton
          label={<Delete className="h-5 w-5" aria-hidden="true" />}
          aria-label={BACKSPACE_LABEL}
          pressed={pressedKey === BACKSPACE_LABEL}
          muted
          onClick={handleBackspace}
        />
      </div>
    </div>
  );
}

interface KeyButtonProps {
  readonly label: ReactNode;
  readonly onClick: () => void;
  readonly pressed?: boolean;
  readonly muted?: boolean;
  readonly "aria-label"?: string;
}

function KeyButton({
  label,
  onClick,
  pressed = false,
  muted = false,
  "aria-label": ariaLabel,
}: KeyButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      data-pressed={pressed ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "flex h-14 w-full items-center justify-center rounded-xl",
        "bg-background border-border/40 border text-xl font-medium shadow-sm",
        muted ? "text-muted-foreground" : "text-foreground",
        "hover:bg-muted/30 transition-transform active:scale-95",
        "data-[pressed=true]:bg-muted data-[pressed=true]:scale-95",
        "[touch-action:manipulation]",
      )}
    >
      {label}
    </button>
  );
}
