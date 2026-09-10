import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { ExtraSettingsSection } from "./extra-settings-section";

// --- Helpers ---

/**
 * `scrollIntoView` non è implementata in jsdom: senza lo stub il test che
 * verifica lo scroll fallirebbe con "not a function" invece di dire se la
 * sezione si è aperta.
 */
function stubScrollIntoView(): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  Element.prototype.scrollIntoView = spy;
  return spy;
}

afterEach(() => {
  globalThis.location.hash = "";
});

// --- Tests ---

describe("ExtraSettingsSection", () => {
  it("nasconde i children di default e segnala il toggle come non espanso", () => {
    render(
      <ExtraSettingsSection>
        <p>Contenuto nascosto</p>
      </ExtraSettingsSection>,
    );

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Contenuto nascosto")).not.toBeInTheDocument();
  });

  it("mostra i children al click sul toggle", () => {
    render(
      <ExtraSettingsSection>
        <p>Contenuto nascosto</p>
      </ExtraSettingsSection>,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Contenuto nascosto")).toBeInTheDocument();
  });

  it("richiude i children al secondo click", () => {
    render(
      <ExtraSettingsSection>
        <p>Contenuto nascosto</p>
      </ExtraSettingsSection>,
    );

    const toggle = screen.getByRole("button");
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Contenuto nascosto")).not.toBeInTheDocument();
  });

  it("espone il toggle con il testo 'Altre impostazioni'", () => {
    render(
      <ExtraSettingsSection>
        <p>Contenuto nascosto</p>
      </ExtraSettingsSection>,
    );

    expect(
      screen.getByRole("button", { name: /altre impostazioni/i }),
    ).toBeInTheDocument();
  });

  it("collega il toggle alla regione dei children via aria-controls", () => {
    render(
      <ExtraSettingsSection>
        <p>Contenuto nascosto</p>
      </ExtraSettingsSection>,
    );

    const toggle = screen.getByRole("button");
    const controlledId = toggle.getAttribute("aria-controls");

    expect(controlledId).toBeTruthy();

    fireEvent.click(toggle);

    const region = document.getElementById(controlledId as string);
    expect(region).toContainElement(screen.getByText("Contenuto nascosto"));
  });

  // --- Apertura da deep-link (REVIEW.md #95) ---

  it("si apre da sola quando l'hash punta a una card che contiene", () => {
    stubScrollIntoView();
    globalThis.location.hash = "#api-keys";

    render(
      <ExtraSettingsSection hashTargets={["api-keys"]}>
        <div id="api-keys">Card API key</div>
      </ExtraSettingsSection>,
    );

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Card API key")).toBeInTheDocument();
  });

  it("scrolla alla card dopo averla resa presente nel DOM", () => {
    const scrollIntoView = stubScrollIntoView();
    globalThis.location.hash = "#api-keys";

    render(
      <ExtraSettingsSection hashTargets={["api-keys"]}>
        <div id="api-keys">Card API key</div>
      </ExtraSettingsSection>,
    );

    // Il target non esiste al mount: se lo scroll partisse prima
    // dell'apertura, getElementById tornerebbe null e questo spy resterebbe
    // fermo. È esattamente il fallimento di `ScrollToHash` che il finding
    // descrive.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("resta chiusa quando l'hash punta a un'ancora fuori dalla sezione", () => {
    stubScrollIntoView();
    globalThis.location.hash = "#billing";

    render(
      <ExtraSettingsSection hashTargets={["api-keys"]}>
        <div id="api-keys">Card API key</div>
      </ExtraSettingsSection>,
    );

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("resta chiusa senza hash", () => {
    stubScrollIntoView();

    render(
      <ExtraSettingsSection hashTargets={["api-keys"]}>
        <div id="api-keys">Card API key</div>
      </ExtraSettingsSection>,
    );

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("degrada a chiusa su fragment malformato senza lanciare", () => {
    stubScrollIntoView();
    globalThis.location.hash = "#%E0%A4%A";

    expect(() =>
      render(
        <ExtraSettingsSection hashTargets={["api-keys"]}>
          <div id="api-keys">Card API key</div>
        </ExtraSettingsSection>,
      ),
    ).not.toThrow();
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("non riapre la sezione che l'utente ha chiuso dopo l'apertura da hash", () => {
    stubScrollIntoView();
    globalThis.location.hash = "#api-keys";

    const { rerender } = render(
      <ExtraSettingsSection hashTargets={["api-keys"]}>
        <div id="api-keys">Card API key</div>
      </ExtraSettingsSection>,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // Un `router.refresh()` (RefreshOnSuccess) ri-renderizza la pagina con un
    // array `hashTargets` nuovo di identità: l'apertura da hash deve valere
    // una volta sola, altrimenti la sezione si riapre sotto le mani.
    rerender(
      <ExtraSettingsSection hashTargets={["api-keys"]}>
        <div id="api-keys">Card API key</div>
      </ExtraSettingsSection>,
    );

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("resta chiusa quando non le viene passato alcun hashTarget", () => {
    stubScrollIntoView();
    globalThis.location.hash = "#api-keys";

    render(
      <ExtraSettingsSection>
        <div id="api-keys">Card API key</div>
      </ExtraSettingsSection>,
    );

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("si apre comunque se la card puntata non è stata renderizzata", () => {
    stubScrollIntoView();
    globalThis.location.hash = "#api-keys";

    // `settings/page.tsx` rende `ApiKeyCard` solo con business + planData: se
    // mancano, l'ancora non esiste e lo scroll non deve lanciare.
    expect(() =>
      render(
        <ExtraSettingsSection hashTargets={["api-keys"]}>
          <p>Nessuna card API key</p>
        </ExtraSettingsSection>,
      ),
    ).not.toThrow();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });
});
