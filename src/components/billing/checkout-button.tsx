"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { track, UMAMI_EVENTS } from "@/lib/umami";

type CheckoutButtonProps = Readonly<{
  priceId: string;
  label: string;
  variant?: "default" | "outline";
}>;

export function CheckoutButton({
  priceId,
  label,
  variant = "default",
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    track(UMAMI_EVENTS.planUpgradeClick, { priceId });
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        globalThis.location.href = data.url;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} onClick={handleClick} disabled={loading}>
      {loading ? "Caricamento..." : label}
    </Button>
  );
}
