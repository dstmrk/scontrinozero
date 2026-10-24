"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type {
  OwnerInviteBlocker,
  TeamMember,
} from "@/lib/collaborator-invites";
import {
  acceptCollaboratorTerms,
  inviteCollaborator,
  revokeCollaboratorInvite,
} from "@/server/invite-actions";

/** Un invito come lo mostra la card: scadenza già calcolata sul server. */
export type InviteRow = {
  id: string;
  email: string;
  expired: boolean;
  /** `DD/MM/YYYY` in ora italiana. */
  expiresLabel: string;
};

type Props = Readonly<{
  businessId: string;
  /** Perché il titolare non può ancora invitare, o `null` se può. */
  blocker: OwnerInviteBlocker | null;
  /** Il tetto della prova, `null` dove i collaboratori sono illimitati. */
  trialLimit: number | null;
  members: readonly TeamMember[];
  invites: readonly InviteRow[];
}>;

type Feedback = { kind: "status" | "alert"; text: string } | null;

/**
 * Card "Collaboratori" del titolare (issue #1099, PR 6a): accettazione delle
 * condizioni, invito, inviti in attesa o scaduti, collaboratori attivi. Le
 * action rivalidano la pagina, quindi dopo ogni azione le props arrivano
 * nuove dal server.
 */
export function CollaboratorsSection({
  businessId,
  blocker,
  trialLimit,
  members,
  invites,
}: Props) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  function invite(email: string, onSent?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      const result = await inviteCollaborator(businessId, email);
      if (result.error) {
        setFeedback({ kind: "alert", text: result.error });
        return;
      }
      setFeedback({ kind: "status", text: `Invito inviato a ${email}.` });
      onSent?.();
    });
  }

  function revoke(inviteId: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await revokeCollaboratorInvite(businessId, inviteId);
      if (result.error) setFeedback({ kind: "alert", text: result.error });
    });
  }

  return (
    // id → ancora per i rimandi dalla UI e dalle guide.
    <Card id="collaboratori" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Collaboratori</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Chi inviti emette scontrini per l&apos;attività con un accesso suo:
          vede solo i documenti che ha emesso e non vede le credenziali AdE.
        </p>

        <InviteStep
          businessId={businessId}
          blocker={blocker}
          trialLimit={trialLimit}
          isPending={isPending}
          onInvite={invite}
          onFeedback={setFeedback}
        />

        {feedback?.kind === "alert" && (
          <p role="alert" className="text-destructive text-sm">
            {feedback.text}
          </p>
        )}
        {feedback?.kind === "status" && (
          <output className="text-muted-foreground block text-sm">
            {feedback.text}
          </output>
        )}

        {members.length > 0 && (
          <div className="space-y-2">
            <h3 id="collaborators-active" className="text-sm font-medium">
              Collaboratori attivi
            </h3>
            <ul aria-labelledby="collaborators-active" className="space-y-1">
              {members.map((member) => (
                <li key={member.id} className="text-sm">
                  {member.name ?? member.email}
                  {member.name && member.email && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {member.email}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {invites.length > 0 && (
          <div className="space-y-2">
            <h3 id="collaborators-invites" className="text-sm font-medium">
              Inviti
            </h3>
            <ul aria-labelledby="collaborators-invites" className="space-y-2">
              {invites.map((row) => (
                <InviteItem
                  key={row.id}
                  row={row}
                  canResend={blocker === null}
                  isPending={isPending}
                  onResend={() => invite(row.email)}
                  onRevoke={() => revoke(row.id)}
                />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Il passo che il titolare ha davanti: piano, Fisconline, condizioni o invito. */
function InviteStep({
  businessId,
  blocker,
  trialLimit,
  isPending,
  onInvite,
  onFeedback,
}: Readonly<{
  businessId: string;
  blocker: OwnerInviteBlocker | null;
  trialLimit: number | null;
  isPending: boolean;
  onInvite: (email: string, onSent: () => void) => void;
  onFeedback: (feedback: Feedback) => void;
}>) {
  if (blocker?.step === "terms") {
    return <TermsAcceptance businessId={businessId} onFeedback={onFeedback} />;
  }
  if (blocker?.step === "fisconline") {
    return (
      <p className="text-sm">
        {blocker.message} Le imposti nella card Credenziali AdE, qui sopra.
      </p>
    );
  }
  if (blocker) return <p className="text-sm">{blocker.message}</p>;
  return (
    <InviteForm
      trialLimit={trialLimit}
      isPending={isPending}
      onInvite={onInvite}
    />
  );
}

function InviteForm({
  trialLimit,
  isPending,
  onInvite,
}: Readonly<{
  trialLimit: number | null;
  isPending: boolean;
  onInvite: (email: string, onSent: () => void) => void;
}>) {
  const [email, setEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onInvite(email.trim(), () => setEmail(""));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="inviteEmail" className="block text-xs font-medium">
        Email del collaboratore
      </label>
      <div className="flex gap-2">
        <Input
          id="inviteEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@esempio.it"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Invita
        </Button>
      </div>
      {trialLimit !== null && (
        <p className="text-muted-foreground text-xs">
          Durante la prova puoi avere fino a {trialLimit} collaboratori, inviti
          in sospeso compresi. Con Team sono illimitati.
        </p>
      )}
    </form>
  );
}

function TermsAcceptance({
  businessId,
  onFeedback,
}: Readonly<{
  businessId: string;
  onFeedback: (feedback: Feedback) => void;
}>) {
  const [checked, setChecked] = useState(false);
  const [isPending, startTransition] = useTransition();

  function accept() {
    onFeedback(null);
    startTransition(async () => {
      const result = await acceptCollaboratorTerms(businessId);
      if (result.error) onFeedback({ kind: "alert", text: result.error });
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Prima del primo invito leggi le{" "}
        <a
          href="/condizioni-collaboratori"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          Condizioni per i collaboratori
        </a>
        : dicono cosa può fare chi inviti, cosa resta a tuo carico e come
        trattiamo i suoi dati per tuo conto.
      </p>
      <div className="flex items-start gap-2">
        <Checkbox
          id="collaboratorTerms"
          checked={checked}
          onCheckedChange={(value) => setChecked(value === true)}
          className="mt-0.5 shrink-0"
        />
        <label
          htmlFor="collaboratorTerms"
          className="cursor-pointer text-sm leading-snug select-none"
        >
          Ho letto e accetto le Condizioni per i collaboratori.
        </label>
      </div>
      <Button type="button" onClick={accept} disabled={!checked || isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Accetta
      </Button>
    </div>
  );
}

function InviteItem({
  row,
  canResend,
  isPending,
  onResend,
  onRevoke,
}: Readonly<{
  row: InviteRow;
  canResend: boolean;
  isPending: boolean;
  onResend: () => void;
  onRevoke: () => void;
}>) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>
        {row.email}
        <span className="text-muted-foreground">
          {" "}
          · {row.expired ? "Scaduto" : `Scade il ${row.expiresLabel}`}
        </span>
      </span>
      <span className="flex gap-2">
        {canResend && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onResend}
            aria-label={`Reinvia a ${row.email}`}
          >
            Reinvia
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={onRevoke}
          aria-label={`${row.expired ? "Elimina" : "Revoca"} l'invito a ${row.email}`}
        >
          {row.expired ? "Elimina" : "Revoca"}
        </Button>
      </span>
    </li>
  );
}
