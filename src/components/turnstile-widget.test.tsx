import { describe, it, expect, vi, afterEach } from "vitest";
import { createRef } from "react";
import { render } from "@testing-library/react";
import type { TurnstileInstance } from "@marsidev/react-turnstile";

type TurnstileProps = {
  siteKey: string;
  onSuccess: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
  ref?: React.Ref<TurnstileInstance | null>;
};

const mockTurnstile = vi.fn();
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: (props: TurnstileProps) => {
    mockTurnstile(props);
    return <div data-testid="turnstile" />;
  },
}));

describe("TurnstileWidget", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockTurnstile.mockClear();
  });

  it("non si renderizza se NEXT_PUBLIC_TURNSTILE_SITE_KEY è mancante", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const { TurnstileWidget } = await import("./turnstile-widget");
    const onToken = vi.fn();
    const { queryByTestId } = render(<TurnstileWidget onToken={onToken} />);
    expect(queryByTestId("turnstile")).toBeNull();
    expect(mockTurnstile).not.toHaveBeenCalled();
  });

  it("passa la siteKey al Turnstile sottostante quando l'env è settata", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
    const { TurnstileWidget } = await import("./turnstile-widget");
    const onToken = vi.fn();
    render(<TurnstileWidget onToken={onToken} />);
    expect(mockTurnstile).toHaveBeenCalledWith(
      expect.objectContaining({ siteKey: "test-site-key" }),
    );
  });

  it("invoca onToken col token quando Turnstile chiama onSuccess", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
    const { TurnstileWidget } = await import("./turnstile-widget");
    const onToken = vi.fn();
    render(<TurnstileWidget onToken={onToken} />);
    const props = mockTurnstile.mock.calls[0][0] as TurnstileProps;
    props.onSuccess("captcha-token-abc");
    expect(onToken).toHaveBeenCalledWith("captcha-token-abc");
  });

  it("invoca onToken(null) su onExpire e onError", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
    const { TurnstileWidget } = await import("./turnstile-widget");
    const onToken = vi.fn();
    render(<TurnstileWidget onToken={onToken} />);
    const props = mockTurnstile.mock.calls[0][0] as TurnstileProps;

    props.onExpire();
    expect(onToken).toHaveBeenLastCalledWith(null);

    props.onError();
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("inoltra il ref al Turnstile sottostante (per reset imperativo)", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
    const { TurnstileWidget } = await import("./turnstile-widget");
    const onToken = vi.fn();
    const ref = createRef<TurnstileInstance | null>();
    render(<TurnstileWidget onToken={onToken} ref={ref} />);
    const props = mockTurnstile.mock.calls[0][0] as TurnstileProps;
    expect(props.ref).toBe(ref);
  });

  it("non monta nulla (ref incluso) senza siteKey: reset è un no-op sicuro", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const { TurnstileWidget } = await import("./turnstile-widget");
    const onToken = vi.fn();
    const ref = createRef<TurnstileInstance | null>();
    render(<TurnstileWidget onToken={onToken} ref={ref} />);
    expect(mockTurnstile).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
    expect(() => ref.current?.reset()).not.toThrow();
  });
});
