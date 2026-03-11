"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyAdeCredentials } from "@/server/onboarding-actions";

interface AdeCredentialsSectionProps {
  businessId: string | null;
  hasCredentials: boolean;
  verifiedAt: Date | null;
}

export function AdeCredentialsSection({
  businessId,
  hasCredentials,
  verifiedAt,
}: Readonly<AdeCredentialsSectionProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(!!verifiedAt);

  if (!hasCredentials) {
    return (
      <p className="text-muted-foreground">Nessuna credenziale configurata.</p>
    );
  }

  function handleVerify() {
    if (!businessId) return;
    setError(null);
    const id = businessId;
    startTransition(async () => {
      const result = await verifyAdeCredentials(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsVerified(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Stato:</span>
        {isVerified ? (
          <Badge variant="default">Verificate</Badge>
        ) : (
          <Badge variant="secondary">Non verificate</Badge>
        )}
      </div>
      {!isVerified && (
        <>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button
            size="sm"
            variant="outline"
            onClick={handleVerify}
            disabled={isPending}
          >
            {isPending ? "Verifica in corso..." : "Verifica credenziali"}
          </Button>
        </>
      )}
    </div>
  );
}
