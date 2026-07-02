import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";

type ScriptProps = {
  src?: string;
  strategy?: string;
  "data-website-id"?: string;
};

const mockScript = vi.fn();
vi.mock("next/script", () => ({
  default: (props: ScriptProps) => {
    mockScript(props);
    return <script data-testid="umami" {...props} />;
  },
}));

describe("UmamiScript", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockScript.mockClear();
  });

  it("non renderizza nulla se NEXT_PUBLIC_UMAMI_SRC è mancante", async () => {
    vi.stubEnv("NEXT_PUBLIC_UMAMI_SRC", "");
    vi.stubEnv("NEXT_PUBLIC_UMAMI_WEBSITE_ID", "abc-123");
    const { UmamiScript } = await import("./umami-script");
    const { queryByTestId } = render(<UmamiScript />);
    expect(queryByTestId("umami")).toBeNull();
    expect(mockScript).not.toHaveBeenCalled();
  });

  it("non renderizza nulla se manca il website id (regola 18, present-but-empty)", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_UMAMI_SRC",
      "https://analytics.scontrinozero.it/script.js",
    );
    vi.stubEnv("NEXT_PUBLIC_UMAMI_WEBSITE_ID", "");
    const { UmamiScript } = await import("./umami-script");
    const { queryByTestId } = render(<UmamiScript />);
    expect(queryByTestId("umami")).toBeNull();
    expect(mockScript).not.toHaveBeenCalled();
  });

  it("carica lo script con src, website id e strategy afterInteractive", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_UMAMI_SRC",
      "https://analytics.scontrinozero.it/script.js",
    );
    vi.stubEnv("NEXT_PUBLIC_UMAMI_WEBSITE_ID", "abc-123");
    const { UmamiScript } = await import("./umami-script");
    render(<UmamiScript />);
    expect(mockScript).toHaveBeenCalledWith(
      expect.objectContaining({
        src: "https://analytics.scontrinozero.it/script.js",
        "data-website-id": "abc-123",
        strategy: "afterInteractive",
      }),
    );
  });
});
