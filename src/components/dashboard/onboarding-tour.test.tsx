import type { ComponentType } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// markOnboardingTourSeen è una server action: mockata per asserire QUANDO viene
// chiamata senza toccare DB/Supabase.
const { mockMarkSeen } = vi.hoisted(() => ({
  mockMarkSeen: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/server/onboarding-actions", () => ({
  markOnboardingTourSeen: mockMarkSeen,
}));

// react-joyride è caricata via `next/dynamic` (ssr:false). Mockiamo `dynamic`
// per restituire uno stub sincrono di Joyride che:
// - espone bottoni per simulare i tre esiti terminali (finish/skip/target
//   mancante) chiamando `onEvent`;
// - renderizza il `tooltipComponent` reale (TourTooltip) con render props
//   fabbricate, così da coprirne i rami (back nascosto a index 0, "Fine"
//   all'ultimo step).
vi.mock("next/dynamic", async () => {
  const { createElement: h, Fragment } = await import("react");

  function MockJoyride(props: {
    onEvent: (data: { status: string; type: string }) => void;
    tooltipComponent: ComponentType<Record<string, unknown>>;
  }) {
    const Tooltip = props.tooltipComponent;
    const baseProps = {
      backProps: { title: "Indietro" },
      closeProps: { title: "Chiudi" },
      primaryProps: { title: "Avanti" },
      skipProps: { title: "Salta" },
      tooltipProps: {},
      size: 5,
    };

    return h(
      "div",
      { "data-testid": "joyride" },
      h(
        "button",
        {
          "data-testid": "finish",
          onClick: () =>
            props.onEvent({ status: "finished", type: "tour:end" }),
        },
        "finish",
      ),
      h(
        "button",
        {
          "data-testid": "skip",
          onClick: () => props.onEvent({ status: "skipped", type: "tour:end" }),
        },
        "skip",
      ),
      h(
        "button",
        {
          "data-testid": "notfound",
          onClick: () =>
            props.onEvent({
              status: "running",
              type: "error:target_not_found",
            }),
        },
        "notfound",
      ),
      h(
        Fragment,
        null,
        // index 0, non ultimo → back nascosto, primary "Avanti".
        h(Tooltip, {
          ...baseProps,
          index: 0,
          isLastStep: false,
          step: { title: "Titolo step", content: "Contenuto step" },
        }),
        // index 1, ultimo → back visibile, primary "Fine".
        h(Tooltip, {
          ...baseProps,
          index: 1,
          isLastStep: true,
          step: { title: "Ultimo step", content: "Contenuto finale" },
        }),
      ),
    );
  }

  return { default: () => MockJoyride };
});

import { OnboardingTour } from "./onboarding-tour";

describe("OnboardingTour", () => {
  beforeEach(() => {
    mockMarkSeen.mockClear();
    // jsdom non implementa matchMedia: default desktop=false (mobile).
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  });

  it("monta il tour al primo accesso", async () => {
    render(<OnboardingTour />);
    expect(await screen.findByTestId("joyride")).toBeInTheDocument();
  });

  it("marca il tour come visto al completamento e lo smonta", async () => {
    render(<OnboardingTour />);
    fireEvent.click(await screen.findByTestId("finish"));

    await waitFor(() => expect(mockMarkSeen).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("joyride")).not.toBeInTheDocument();
  });

  it("marca il tour come visto quando viene skippato", async () => {
    render(<OnboardingTour />);
    fireEvent.click(await screen.findByTestId("skip"));

    await waitFor(() => expect(mockMarkSeen).toHaveBeenCalledTimes(1));
  });

  it("marca il tour come visto se un target non viene trovato (no loop)", async () => {
    render(<OnboardingTour />);
    fireEvent.click(await screen.findByTestId("notfound"));

    await waitFor(() => expect(mockMarkSeen).toHaveBeenCalledTimes(1));
  });

  it("il tooltip mostra titolo, contenuto e label italiane", async () => {
    render(<OnboardingTour />);
    await screen.findByTestId("joyride");

    expect(screen.getByText("Titolo step")).toBeInTheDocument();
    expect(screen.getByText("Contenuto step")).toBeInTheDocument();
    // Label dal `locale` italiano, via i render props del tooltip.
    expect(screen.getAllByText("Salta").length).toBeGreaterThan(0);
    expect(screen.getByText("Avanti")).toBeInTheDocument();
    // Ultimo step: back visibile + bottone "Fine".
    expect(screen.getByText("Indietro")).toBeInTheDocument();
    expect(screen.getByText("Fine")).toBeInTheDocument();
  });
});
