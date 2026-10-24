import type { Metadata } from "next";
import { AcceptInviteForm } from "./accept-invite-form";
import { InviteUnavailable } from "./invite-unavailable";
import { readInviteView } from "./invite-view";

export const metadata: Metadata = {
  title: "Invito da collaboratore",
};

/**
 * Pagina del link d'invito di un collaboratore (issue #1099). Chi ha già una
 * sessione non ci arriva: `/invito` è fra le route solo per chi non è
 * autenticato (`proxy.ts`), come `/register`.
 */
export default async function InvitePage({
  params,
}: {
  readonly params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await readInviteView(token);

  if (view.kind === "valid") {
    return (
      <AcceptInviteForm
        token={token}
        email={view.invite.email}
        businessName={view.invite.businessName}
      />
    );
  }
  return <InviteUnavailable view={view} />;
}
