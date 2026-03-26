"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyListItem,
} from "@/server/api-key-actions";

type Props = {
  businessId: string;
};

export function ApiKeySection({ businessId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["api-keys", businessId],
    queryFn: () => listApiKeys(businessId),
  });

  const createMutation = useMutation({
    mutationFn: () => createApiKey(businessId, keyName),
    onSuccess: (result) => {
      if (result.error) return;
      setNewKeyRaw(result.apiKeyRaw ?? null);
      setKeyName("");
      void queryClient.invalidateQueries({
        queryKey: ["api-keys", businessId],
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(keyId),
    onSuccess: () => {
      setRevokeTargetId(null);
      void queryClient.invalidateQueries({
        queryKey: ["api-keys", businessId],
      });
    },
  });

  function handleCopy() {
    if (!newKeyRaw) return;
    void navigator.clipboard.writeText(newKeyRaw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleCreateClose() {
    setCreateOpen(false);
    setKeyName("");
    setNewKeyRaw(null);
    setCopied(false);
  }

  const keys: ApiKeyListItem[] = data?.keys ?? [];
  const createError = createMutation.data?.error ?? null;
  const revokeError = revokeMutation.data?.error ?? null;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Le API key permettono di emettere scontrini in modo programmatico, senza
        passare per il dashboard. La chiave viene mostrata{" "}
        <strong>una sola volta</strong> al momento della creazione.
      </p>

      {isLoading && (
        <p className="text-muted-foreground text-sm">Caricamento…</p>
      )}

      {data?.error && (
        <p className="text-sm text-red-600" role="alert">
          {data.error}
        </p>
      )}

      {keys.length > 0 && (
        <ul className="divide-y rounded-md border">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{k.name}</p>
                <p className="text-muted-foreground font-mono text-xs">
                  {k.keyPrefix}…
                </p>
                {k.lastUsedAt && (
                  <p className="text-muted-foreground text-xs">
                    Usata il{" "}
                    {new Date(k.lastUsedAt).toLocaleDateString("it-IT")}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive ml-2 shrink-0"
                onClick={() => setRevokeTargetId(k.id)}
              >
                Revoca
              </Button>
            </li>
          ))}
        </ul>
      )}

      {keys.length === 0 && !isLoading && !data?.error && (
        <p className="text-muted-foreground text-sm">Nessuna API key attiva.</p>
      )}

      <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
        + Nuova API key
      </Button>

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) handleCreateClose();
          else setCreateOpen(true);
        }}
      >
        <DialogContent>
          {newKeyRaw ? (
            <>
              <DialogHeader>
                <DialogTitle>API key generata</DialogTitle>
                <DialogDescription>
                  Copia la chiave ora — non verrà mostrata di nuovo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <div className="bg-muted rounded-md p-3 font-mono text-xs break-all select-all">
                  {newKeyRaw}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="w-full"
                >
                  {copied ? "Copiata!" : "Copia"}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateClose}>
                  Ho copiato la chiave
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Nuova API key</DialogTitle>
                <DialogDescription>
                  Assegna un nome descrittivo per ricordare a quale integrazione
                  appartiene questa chiave.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="key-name">Nome chiave</Label>
                <Input
                  id="key-name"
                  placeholder="es. Gestionale Mario"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  disabled={createMutation.isPending}
                />
              </div>
              {createError && (
                <p className="text-sm text-red-600" role="alert">
                  {createError}
                </p>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCreateClose}
                  disabled={createMutation.isPending}
                >
                  Annulla
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!keyName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? "Generazione…" : "Genera"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation dialog */}
      <Dialog
        open={!!revokeTargetId}
        onOpenChange={(open) => {
          if (!open) setRevokeTargetId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revocare la chiave?</DialogTitle>
            <DialogDescription>
              La chiave sarà immediatamente disattivata. Le integrazioni che la
              usano smetteranno di funzionare.
            </DialogDescription>
          </DialogHeader>
          {revokeError && (
            <p className="text-sm text-red-600" role="alert">
              {revokeError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeTargetId(null)}
              disabled={revokeMutation.isPending}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (revokeTargetId) revokeMutation.mutate(revokeTargetId);
              }}
            >
              {revokeMutation.isPending ? "Revoca…" : "Revoca chiave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
