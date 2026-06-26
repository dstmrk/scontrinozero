"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Wrapper "Altre impostazioni": raccoglie le sezioni a basso uso (API key,
 * export GDPR, eliminazione account, informazioni app) dietro un toggle, per
 * non allungare lo scroll della pagina Impostazioni. I children sono
 * renderizzati nel server component (`settings/page.tsx`) e passati come prop.
 */
export function ExtraSettingsSection({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((open) => !open)}
        className="text-muted-foreground"
      >
        <ChevronDown
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        Altre impostazioni
      </Button>

      {isOpen && (
        <div id={contentId} className="space-y-6">
          {children}
        </div>
      )}
    </div>
  );
}
