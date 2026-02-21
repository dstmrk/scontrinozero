"use client";

import { Delete } from "lucide-react";
import { appendKeypadChar, backspaceKeypad, cn } from "@/lib/utils";

interface NumericKeypadProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

const KEYS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
] as const;

export function NumericKeypad({ value, onChange }: NumericKeypadProps) {
  const hasDecimal = value.includes(".");
  const decimalDigits = hasDecimal ? value.length - value.indexOf(".") - 1 : 0;
  const isDecimalDisabled = hasDecimal;
  const isDigitDisabled = hasDecimal && decimalDigits >= 2;

  const handleDigit = (digit: string) => {
    if (isDigitDisabled) return;
    onChange(appendKeypadChar(value, digit));
  };

  const handleDecimal = () => {
    onChange(appendKeypadChar(value, "."));
  };

  const handleBackspace = () => {
    onChange(backspaceKeypad(value));
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

      {/* Bottom row: decimal | 0 | backspace */}
      <KeyButton
        label=","
        onClick={handleDecimal}
        disabled={isDecimalDisabled}
        aria-label=","
      />
      <KeyButton label="0" onClick={() => handleDigit("0")} />
      <button
        type="button"
        aria-label="⌫"
        onClick={handleBackspace}
        className={cn(
          "flex h-14 w-full items-center justify-center rounded-xl",
          "bg-muted text-muted-foreground text-xl font-medium",
          "transition-transform active:scale-95",
        )}
      >
        <Delete className="h-5 w-5" />
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
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-14 w-full items-center justify-center rounded-xl",
        "bg-muted text-foreground text-xl font-medium",
        "transition-transform active:scale-95",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {label}
    </button>
  );
}
