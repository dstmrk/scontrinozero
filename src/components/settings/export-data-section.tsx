"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsCollaborator } from "@/components/dashboard/member-role";
import {
  exportCollaboratorData,
  exportUserData,
} from "@/server/export-actions";

/**
 * Portabilità dei dati (GDPR art. 20). Il titolare scarica attività,
 * scontrini e catalogo; il collaboratore i propri dati personali, perché i
 * documenti che emette sono dell'attività (issue #1099).
 */
export function ExportDataSection() {
  const isCollaborator = useIsCollaborator();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setIsLoading(true);
    setError(null);
    try {
      const result = isCollaborator
        ? await exportCollaboratorData()
        : await exportUserData();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scontrinozero-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setError("Si è verificato un errore. Riprova più tardi.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-1 font-medium">Portabilità dati (GDPR art. 20)</h3>
      <p className="text-muted-foreground mb-4 text-sm">
        {isCollaborator
          ? "Scarica i tuoi dati (nome, email, condizioni accettate, ultimo accesso) in formato JSON. I documenti che hai emesso sono dell'attività: li esporta il titolare."
          : "Scarica tutti i tuoi dati (profilo, attività, scontrini, catalogo) in formato JSON."}
      </p>
      {error && <p className="text-destructive mb-2 text-sm">{error}</p>}
      <Button variant="outline" onClick={handleExport} disabled={isLoading}>
        {isLoading ? "Esportazione…" : "Esporta dati"}
      </Button>
    </div>
  );
}
