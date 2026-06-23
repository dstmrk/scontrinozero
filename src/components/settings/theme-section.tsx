"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEME_OPTIONS = [
  { value: "light", label: "Chiaro", Icon: Sun },
  { value: "dark", label: "Scuro", Icon: Moon },
  { value: "system", label: "Sistema", Icon: Monitor },
] as const;

export function ThemeSection() {
  const { theme, setTheme } = useTheme();
  // Il tema reale è noto solo lato client (localStorage / preferenza OS):
  // finché non siamo montati nessuna opzione è "attiva", così il primo render
  // client combacia con l'HTML del server ed evita hydration mismatch.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flag post-mount per evitare SSR/client mismatch sul tema risolto da localStorage
    setMounted(true);
  }, []);

  return (
    <div>
      <p className="text-muted-foreground mb-4 text-sm">
        Scegli l&apos;aspetto dell&apos;app. &laquo;Sistema&raquo; segue le
        impostazioni del tuo dispositivo.
      </p>
      <div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label="Tema dell'interfaccia"
      >
        {THEME_OPTIONS.map(({ value, label, Icon }) => {
          const isActive = mounted && theme === value;
          return (
            <Button
              key={value}
              type="button"
              variant={isActive ? "default" : "outline"}
              aria-pressed={isActive}
              aria-label={label}
              onClick={() => setTheme(value)}
              className="flex h-auto flex-col gap-1.5 py-3"
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="text-xs font-normal">{label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
