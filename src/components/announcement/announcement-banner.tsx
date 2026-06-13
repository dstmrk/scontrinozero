"use client";

import { useState } from "react";
import { Info, OctagonAlert, TriangleAlert, X } from "lucide-react";
import type { AnnouncementLevel } from "@/lib/announcement";
import { safeLocalStorage } from "@/lib/safe-storage";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AnnouncementBannerProps {
  readonly message: string;
  readonly level: AnnouncementLevel;
  readonly dismissible: boolean;
  readonly dismissKey: string;
}

const LEVEL_ICON = {
  info: Info,
  warning: TriangleAlert,
  critical: OctagonAlert,
} as const;

export function AnnouncementBanner({
  message,
  level,
  dismissible,
  dismissKey,
}: AnnouncementBannerProps) {
  // Lazy initializer: legge il dismiss salvato una sola volta al primo render
  // client, senza setState-in-effect (stesso pattern di PwaInstallPrompt).
  // SSR-safe e tollerante allo storage bloccato via safeLocalStorage.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (globalThis.window === undefined) return false;
    return safeLocalStorage.getItem(dismissKey) === "1";
  });

  if (dismissible && dismissed) return null;

  const handleDismiss = () => {
    safeLocalStorage.setItem(dismissKey, "1");
    setDismissed(true);
  };

  const Icon = LEVEL_ICON[level];

  return (
    <Alert variant={level} className="rounded-none border-x-0 border-t-0">
      <Icon aria-hidden="true" />
      <AlertDescription className="flex w-full items-center gap-2">
        <span className="flex-1">{message}</span>
        {dismissible ? (
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Chiudi"
            className="-my-1 shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
