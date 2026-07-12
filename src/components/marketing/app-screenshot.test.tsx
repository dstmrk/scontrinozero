// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppScreenshot } from "./app-screenshot";

describe("AppScreenshot", () => {
  it("renders an accessible image with the given alt text", () => {
    render(
      <AppScreenshot
        src="/screenshots/scontrino-emesso.png"
        alt="Scontrino emesso su ScontrinoZero"
        width={900}
        height={1860}
      />,
    );
    const img = screen.getByAltText("Scontrino emesso su ScontrinoZero");
    expect(img).toBeTruthy();
    // next/image conserva il filename nella URL ottimizzata
    expect(img.getAttribute("src")).toContain("scontrino-emesso");
  });

  it("applies extra className passed by the caller (cluster positioning)", () => {
    render(
      <AppScreenshot
        src="/screenshots/catalogo.png"
        alt="Catalogo prodotti"
        width={900}
        height={1860}
        className="absolute -rotate-6"
      />,
    );
    const img = screen.getByAltText("Catalogo prodotti");
    expect(img.className).toContain("absolute");
    expect(img.className).toContain("-rotate-6");
  });

  it("marks the image as high priority when requested (no lazy loading)", () => {
    render(
      <AppScreenshot
        src="/screenshots/scontrino-emesso.png"
        alt="Mockup hero"
        width={900}
        height={1860}
        priority
      />,
    );
    const img = screen.getByAltText("Mockup hero");
    // next/image disattiva il lazy-load quando priority è attivo
    expect(img.getAttribute("loading")).not.toBe("lazy");
  });
});
