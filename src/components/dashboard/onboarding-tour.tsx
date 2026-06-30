"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import type {
  EventData,
  Props as JoyrideProps,
  Step,
  TooltipRenderProps,
} from "react-joyride";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { markOnboardingTourSeen } from "@/server/onboarding-actions";

// react-joyride caricata in dynamic import (client-only): i ~34 KB stanno in un
// chunk separato e non toccano il bundle principale del dashboard né la
// performance percepita (priorità #1). ssr:false perché il tour vive solo nel
// browser (legge il viewport, monta un overlay).
// react-joyride v3 espone solo l'export nominato `Joyride` (niente default).
const Joyride = dynamic<JoyrideProps>(
  () => import("react-joyride").then((m) => m.Joyride),
  { ssr: false },
);

// Status/eventi terminali confrontati come stringhe letterali (valori stabili
// degli enum STATUS/EVENTS di react-joyride): importare a runtime quelle
// costanti trascinerebbe la libreria FUORI dal chunk dinamico, vanificando
// l'isolamento del bundle.
const STATUS_FINISHED = "finished";
const STATUS_SKIPPED = "skipped";
const EVENT_TARGET_NOT_FOUND = "error:target_not_found";

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

/**
 * Step del tour. La nav è responsive: su desktop vive nell'header
 * (`[data-tour-nav="desktop"]`), su mobile nella bottom-nav
 * (`[data-tour-nav="mobile"]`) più l'icona impostazioni nell'header. Entrambi i
 * container esistono sempre nel DOM ma uno è `display:none` a seconda del
 * breakpoint: scegliamo l'array di step in base al viewport così da puntare
 * SEMPRE all'elemento visibile (uno spotlight su un elemento nascosto cadrebbe
 * a 0,0). Sulla bottom-nav `position:fixed` serve `isFixed`.
 */
function buildSteps(isDesktop: boolean): Step[] {
  const navScope = isDesktop
    ? '[data-tour-nav="desktop"]'
    : '[data-tour-nav="mobile"]';

  const settingsTarget = isDesktop
    ? '[data-tour-nav="desktop"] [data-tour-step="settings"]'
    : '[data-tour-step="settings-mobile"]';

  return [
    {
      target: "body",
      placement: "center",
      title: "Benvenuto in ScontrinoZero",
      content:
        "Ti mostriamo in pochi passi le funzioni principali. Puoi saltare il tour in qualsiasi momento.",
    },
    {
      target: `${navScope} [data-tour-step="catalogo"]`,
      title: "Catalogo",
      content:
        "Qui gestisci i tuoi prodotti e servizi: li aggiungi una volta e li richiami al volo in cassa.",
      isFixed: !isDesktop,
    },
    {
      target: `${navScope} [data-tour-step="cassa"]`,
      title: "Cassa",
      content:
        "Da qui emetti uno scontrino: scegli i prodotti o l'importo e invii il documento commerciale all'Agenzia delle Entrate.",
      isFixed: !isDesktop,
    },
    {
      target: `${navScope} [data-tour-step="storico"]`,
      title: "Storico",
      content:
        "Ritrovi tutti gli scontrini emessi, con i dettagli e la possibilità di annullarli.",
      isFixed: !isDesktop,
    },
    {
      target: settingsTarget,
      title: "Impostazioni",
      content:
        "Gestisci credenziali AdE, abbonamento e dati attività. Qui trovi anche l'assistenza se ti serve aiuto.",
      isFixed: !isDesktop,
    },
  ];
}

/**
 * Tooltip custom reso con i nostri componenti `ui` (Card/Button): eredita
 * gratis i token OKLCH, la dark mode e l'a11y/focus. Le label dei bottoni
 * arrivano dal `locale` via `*.title` (italiano).
 */
function TourTooltip({
  index,
  size,
  isLastStep,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <Card
      {...tooltipProps}
      className="w-[min(20rem,calc(100vw-2rem))] gap-0 py-0 shadow-lg"
    >
      <CardHeader className="relative px-4 pt-4 pb-2">
        <CardTitle className="text-base">{step.title}</CardTitle>
        <button
          {...closeProps}
          className="text-muted-foreground hover:text-foreground absolute top-3 right-3"
        >
          <X className="size-4" />
        </button>
      </CardHeader>
      <CardContent className="text-muted-foreground px-4 pb-3 text-sm">
        {step.content}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2 px-4 pb-4">
        <Button {...skipProps} variant="ghost" size="sm">
          {skipProps.title}
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">
            {index + 1}/{size}
          </span>
          {index > 0 && (
            <Button {...backProps} variant="outline" size="sm">
              {backProps.title}
            </Button>
          )}
          <Button {...primaryProps} size="sm">
            {isLastStep ? "Fine" : primaryProps.title}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

/**
 * Walkthrough guidato del dashboard, mostrato una sola volta al primo accesso
 * (PLAN.md v1.4.1). Montato dal dashboard layout SOLO se il flag per-utente
 * `onboarding_tour_seen_at` è NULL, quindi qui parte sempre in automatico.
 */
export function OnboardingTour() {
  // Joyride è caricato con ssr:false: durante SSR e l'hydration iniziale rende
  // null, quindi possiamo partire con run=true senza mismatch di hydration
  // (nessun nodo DOM finché il chunk non monta lato client).
  const [run, setRun] = useState(true);
  const [, startTransition] = useTransition();

  // matchMedia letto in modo SSR-safe in un initializer (niente setState in
  // effect): su server cade a false, lato client riflette il viewport. Il valore
  // conta solo quando Joyride monta (post-hydration), quindi è già corretto.
  const isDesktop = useMemo(
    () =>
      globalThis.window !== undefined &&
      window.matchMedia(DESKTOP_MEDIA_QUERY).matches,
    [],
  );

  const steps = useMemo(() => buildSteps(isDesktop), [isDesktop]);

  function endTour() {
    setRun(false);
    // Persistenza optimistic: l'overlay è già sparito (run=false), la scrittura
    // va in background. markOnboardingTourSeen degrada da sé su errore DB
    // (regola 19/20): niente toast, il tour è cosmetico.
    startTransition(async () => {
      await markOnboardingTourSeen();
    });
  }

  function handleEvent(data: EventData) {
    // Marca "visto" su completamento, skip o target mancante: in ogni caso il
    // tour non deve riproporsi in loop al prossimo accesso.
    if (
      data.status === STATUS_FINISHED ||
      data.status === STATUS_SKIPPED ||
      data.type === EVENT_TARGET_NOT_FOUND
    ) {
      endTour();
    }
  }

  if (!run) return null;

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      onEvent={handleEvent}
      tooltipComponent={TourTooltip}
      options={{
        skipBeacon: true,
        overlayClickAction: false,
        closeButtonAction: "skip",
      }}
      locale={{
        back: "Indietro",
        close: "Chiudi",
        last: "Fine",
        next: "Avanti",
        skip: "Salta",
      }}
    />
  );
}
