"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeCollaborator } from "@/server/collaborator-actions";

/** Un collaboratore come lo mostra la card: data già formattata sul server. */
export type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  /** `DD/MM/YYYY` in ora italiana, `null` se non è mai entrato. */
  lastSeenLabel: string | null;
};

export type MemberListFeedback = { kind: "status" | "alert"; text: string };

type Props = Readonly<{
  businessId: string;
  members: readonly MemberRow[];
  onFeedback: (feedback: MemberListFeedback | null) => void;
}>;

/**
 * Collaboratori attivi del titolare, con l'ultimo accesso e la rimozione
 * (issue #1099). Rimuovere cancella l'account del collaboratore, quindi passa
 * da una conferma.
 */
export function CollaboratorMemberList({
  businessId,
  members,
  onFeedback,
}: Props) {
  const [target, setTarget] = useState<MemberRow | null>(null);
  const [isPending, startTransition] = useTransition();

  if (members.length === 0) return null;

  function confirmRemoval(member: MemberRow) {
    onFeedback(null);
    startTransition(async () => {
      const result = await removeCollaborator(businessId, member.id);
      setTarget(null);
      onFeedback(
        result.error
          ? { kind: "alert", text: result.error }
          : { kind: "status", text: `Accesso di ${labelOf(member)} rimosso.` },
      );
    });
  }

  return (
    <div className="space-y-2">
      <h3 id="collaborators-active" className="text-sm font-medium">
        Collaboratori attivi
      </h3>
      <ul aria-labelledby="collaborators-active" className="space-y-2">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              {labelOf(member)}
              <span className="text-muted-foreground">
                {member.name && member.email && ` · ${member.email}`}
                {" · "}
                {member.lastSeenLabel
                  ? `ultimo accesso il ${member.lastSeenLabel}`
                  : "nessun accesso registrato"}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setTarget(member)}
              aria-label={`Rimuovi ${labelOf(member)}`}
            >
              Rimuovi
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && !isPending && setTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target && `Rimuovere ${labelOf(target)}?`}
            </DialogTitle>
            <DialogDescription>
              Il suo account viene eliminato subito e non potrà più accedere. I
              documenti che ha emesso restano nello storico, attribuiti al suo
              nome. Riceverà un&apos;email.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setTarget(null)}
            >
              Annulla
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => target && confirmRemoval(target)}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rimuovi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function labelOf(member: Pick<MemberRow, "name" | "email">): string {
  return member.name ?? member.email ?? "Collaboratore";
}
