"use client";

import { useState } from "react";
import { Share2, Check, Copy } from "lucide-react";

interface ShareButtonProps {
  readonly url: string;
  readonly title: string;
}

export function ShareButton({ url, title }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const fullUrl =
      typeof globalThis.window === "undefined"
        ? url
        : `${globalThis.location.origin}${url}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url: fullUrl, title });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — do nothing
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-600" />
          <span className="text-green-600">Link copiato!</span>
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" />
          Condividi ricevuta
        </>
      )}
      {!copied && <Copy className="ml-auto h-3.5 w-3.5 text-gray-400" />}
    </button>
  );
}
