"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  readHashId,
  readServerHashId,
  subscribeToHash,
} from "@/lib/hash-target";

/** Riferimento stabile: evita di ri-valutare l'hash a ogni render del parent. */
const NO_HASH_TARGETS: readonly string[] = [];

/**
 * Wrapper "Altre impostazioni": raccoglie le sezioni a basso uso (API key,
 * export GDPR, eliminazione account, informazioni app) dietro un toggle, per
 * non allungare lo scroll della pagina Impostazioni. I children sono
 * renderizzati nel server component (`settings/page.tsx`) e passati come prop.
 *
 * `hashTargets` elenca gli `id` delle card che vivono qui dentro. Quando
 * l'hash corrente ne punta uno, la sezione si apre e ci scrolla da sé —
 * `ScrollToHash` da solo non basta: il suo effect gira prima di questo
 * (ordine di documento fra sibling) e a quel punto il target non è ancora nel
 * DOM, perché i children di una sezione chiusa non sono renderizzati affatto.
 * È il difetto che rendeva morto il deep-link `#api-keys` (REVIEW.md #95).
 *
 * L'hash è letto con `useSyncExternalStore` e non in un effect: è stato
 * esterno al render, il server non lo vede mai, e leggerlo così fa idratare
 * React sullo snapshot server (chiusa) prima di ri-renderizzare con quello
 * client — invece di un hydration mismatch o di un `setState` in effect.
 *
 * Il toggle manuale vince sull'hash una volta usato (`manualOpen`): senza,
 * un `router.refresh()` (`RefreshOnSuccess`) riaprirebbe la sezione che
 * l'utente ha appena chiuso, perché l'hash nell'URL è ancora lì.
 */
export function ExtraSettingsSection({
  children,
  hashTargets = NO_HASH_TARGETS,
}: {
  readonly children: ReactNode;
  readonly hashTargets?: readonly string[];
}) {
  const contentId = useId();
  const hashId = useSyncExternalStore(
    subscribeToHash,
    readHashId,
    readServerHashId,
  );
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);

  const targetId =
    hashId !== null && hashTargets.includes(hashId) ? hashId : null;
  const isOpen = manualOpen ?? targetId !== null;

  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen || targetId === null || scrolledTo.current === targetId) return;
    scrolledTo.current = targetId;
    // Solo ora il target è nel DOM: i children di una sezione chiusa non
    // sono renderizzati affatto, e `getElementById` tornerebbe null. Resta
    // opzionale perché la card può non essere stata resa (in `settings/page`
    // `ApiKeyCard` richiede business + planData).
    document.getElementById(targetId)?.scrollIntoView({ block: "start" });
  }, [isOpen, targetId]);

  return (
    <div className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setManualOpen(!isOpen)}
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
