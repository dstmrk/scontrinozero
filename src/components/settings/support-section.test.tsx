import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SupportSection } from "./support-section";

describe("SupportSection", () => {
  it("linka il Centro assistenza con un path relativo (hop di dominio via middleware)", () => {
    render(
      <SupportSection
        accountEmail="mario@example.com"
        plan="pro"
        appVersion="1.4.1"
      />,
    );

    const helpLink = screen.getByRole("link", { name: /centro assistenza/i });
    expect(helpLink).toHaveAttribute("href", "/help/contatto-assistenza");
  });

  it("espone un link email che apre un mailto pre-compilato", () => {
    render(
      <SupportSection
        accountEmail="mario@example.com"
        plan="pro"
        appVersion="1.4.1"
      />,
    );

    const mailLink = screen.getByRole("link", { name: /scrivici via email/i });
    const href = mailLink.getAttribute("href") ?? "";

    expect(href).toMatch(/^mailto:info@scontrinozero\.it\?/);
    expect(href).toContain("subject=");
    expect(href).toContain("body=");
  });

  it("inserisce email account e versione nel corpo del mailto", () => {
    render(
      <SupportSection
        accountEmail="mario@example.com"
        plan="pro"
        appVersion="1.4.1"
      />,
    );

    const href =
      screen
        .getByRole("link", { name: /scrivici via email/i })
        .getAttribute("href") ?? "";
    const body =
      new URLSearchParams(href.split("?")[1] ?? "").get("body") ?? "";

    expect(body).toContain("mario@example.com");
    expect(body).toContain("1.4.1");
  });

  it("non rompe il mailto quando email account e piano sono assenti", () => {
    render(
      <SupportSection accountEmail={null} plan={null} appVersion="1.4.1" />,
    );

    const href =
      screen
        .getByRole("link", { name: /scrivici via email/i })
        .getAttribute("href") ?? "";

    expect(href).toMatch(/^mailto:/);
    expect(href).not.toContain("undefined");
  });
});
