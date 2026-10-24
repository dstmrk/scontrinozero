import {
  findInviteByToken,
  isInviteTokenShape,
  type InviteFromLink,
} from "@/lib/collaborator-invites";
import { logger } from "@/lib/logger";

/** Cosa mostrare a chi apre il link d'invito. */
export type InviteView =
  | { kind: "valid"; invite: InviteFromLink }
  | { kind: "missing" }
  | { kind: "expired"; businessName: string | null }
  | { kind: "error" };

export async function readInviteView(token: string): Promise<InviteView> {
  // Guard prima del lookup: un valore malformato non tocca il DB.
  if (!isInviteTokenShape(token)) return { kind: "missing" };
  try {
    const invite = await findInviteByToken(token);
    if (!invite) return { kind: "missing" };
    if (invite.expiresAt.getTime() <= Date.now()) {
      return { kind: "expired", businessName: invite.businessName };
    }
    return { kind: "valid", invite };
  } catch (err) {
    logger.error({ err }, "InvitePage: invito non leggibile");
    return { kind: "error" };
  }
}
