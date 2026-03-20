"use client";

import * as React from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Seleziona periodo",
  className,
  disabled = false,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const label = React.useMemo(() => {
    if (!value?.from) return placeholder;
    if (!value.to || value.from.getTime() === value.to.getTime()) {
      return format(value.from, "dd/MM/yyyy", { locale: it });
    }
    return `${format(value.from, "dd/MM/yyyy", { locale: it })} – ${format(value.to, "dd/MM/yyyy", { locale: it })}`;
  }, [value, placeholder]);

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(undefined);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-8 w-full min-w-[200px] justify-start gap-2 px-2.5 font-normal",
            !value?.from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left text-sm">{label}</span>
          {value?.from && (
            <span
              role="button"
              aria-label="Cancella periodo"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground ml-auto text-xs"
            >
              ✕
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          disabled={{ after: new Date() }}
          locale={it}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  );
}
