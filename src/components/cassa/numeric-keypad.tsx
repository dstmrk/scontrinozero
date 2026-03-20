"use client";

import { Delete } from "lucide-react";
import { appendDigitCents, backspaceCents, cn } from "@/lib/utils";
import { vibrate } from "@/lib/haptics";

interface NumericKeypadProps {
  readonly value: number; // centesimi
  readonly onChange: (value: number) => void;
}

const KEYS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
] as const;

export function NumericKeypad({ value, onChange }: NumericKeypadProps) {
  const handleDigit = (digit: string) => {
    onChange(appendDigitCents(value, digit));
  };

  const handle00 = () => {
    onChange(appendDigitCents(appendDigitCents(value, "0"), "0"));
  };

  const handleBackspace = () => {
    onChange(backspaceCents(value));
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((row, rowIdx) =>
        row.map((key, colIdx) => (
          <KeyButton
            key={`${rowIdx}-${colIdx}`}
            label={key}
            onClick={() => handleDigit(key)}
          />
        )),
      )}

      {/* Bottom row: 00 | 0 | backspace */}
      <KeyButton label="00" onClick={handle00} aria-label="00" />
      <KeyButton label="0" onClick={() => handleDigit("0")} />
      <button
        type="button"
        aria-label="⌫"
        onPointerDown={() => vibrate("light")}
        onClick={handleBackspace}
        className={cn(
          "flex h-14 w-full items-center justify-center rounded-xl",
          "bg-background border-border/40 text-muted-foreground border text-xl font-medium shadow-sm",
          "hover:bg-muted/30 transition-transform active:scale-95",
          "[touch-action:manipulation]",
        )}
      >
        <Delete className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

interface KeyButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly "aria-label"?: string;
}

function KeyButton({
  label,
  onClick,
  disabled = false,
  "aria-label": ariaLabel,
}: KeyButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      onPointerDown={() => vibrate("light")}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-14 w-full items-center justify-center rounded-xl",
        "bg-background border-border/40 text-foreground border text-xl font-medium shadow-sm",
        "hover:bg-muted/30 transition-transform active:scale-95",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "[touch-action:manipulation]",
      )}
    >
      {label}
    </button>
  );
}
