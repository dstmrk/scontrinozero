import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollaboratorsSection } from "@/components/settings/collaborators-section";
import {
  listTeam,
  ownerInviteBlocker,
  type TeamInvite,
  type TeamMember,
} from "@/lib/collaborator-invites";
import { formatRomeDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import type { PlanInfo } from "@/lib/plans";
import { getCollaboratorLimit } from "@/lib/plans-shared";

type Props = Readonly<{
  businessId: string | undefined;
  planInfo: Pick<PlanInfo, "plan" | "trialStartedAt" | "planExpiresAt"> | null;
  /** Versione delle Condizioni per i collaboratori accettata dal titolare. */
  collaboratorTermsVersion: string | null | undefined;
  credentials: { loginMethod: string; verifiedAt: Date | null } | null;
}>;

/**
 * Card "Collaboratori" della pagina impostazioni del titolare (issue #1099).
 * Legge da sé collaboratori e inviti, così la pagina la monta in un
 * `Suspense` senza aspettarla.
 *
 * C'è quando il piano ammette collaboratori, e anche dopo un downgrade finché
 * resta qualcuno da gestire: con un invito in sospeso il passaggio a CIE o
 * SPID è bloccato, e il titolare deve poterlo revocare. Il blocco con upsell
 * per Starter e Pro arriva con la PR 7.
 */
export async function CollaboratorsCard({
  businessId,
  planInfo,
  collaboratorTermsVersion,
  credentials,
}: Props) {
  if (!businessId || !planInfo) return null;

  let team: { members: TeamMember[]; invites: TeamInvite[] };
  try {
    team = await listTeam(businessId);
  } catch (err) {
    // Regola 19: una lettura che fallisce non porta la pagina sull'error
    // boundary.
    logger.error({ err, businessId }, "CollaboratorsCard: lettura fallita");
    return (
      <Card>
        <CardHeader>
          <CardTitle>Collaboratori</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-destructive text-sm">
            Non riusciamo a caricare i collaboratori. Ricarica la pagina.
          </p>
        </CardContent>
      </Card>
    );
  }

  const blocker = ownerInviteBlocker(planInfo, {
    collaboratorTermsVersion: collaboratorTermsVersion ?? null,
    loginMethod: credentials?.loginMethod ?? null,
    verifiedAt: credentials?.verifiedAt ?? null,
  });
  if (
    blocker?.step === "plan" &&
    team.members.length === 0 &&
    team.invites.length === 0
  ) {
    return null;
  }

  return (
    <CollaboratorsSection
      businessId={businessId}
      blocker={blocker}
      trialLimit={getCollaboratorLimit(planInfo.plan)}
      members={team.members.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        lastSeenLabel: member.lastSeenAt
          ? formatRomeDate(member.lastSeenAt)
          : null,
      }))}
      invites={team.invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        expired: invite.expired,
        expiresLabel: formatRomeDate(invite.expiresAt),
      }))}
    />
  );
}
