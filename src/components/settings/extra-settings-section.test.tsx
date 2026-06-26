import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ExtraSettingsSection } from "./extra-settings-section";

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
});
