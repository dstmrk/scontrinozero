import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordSection } from "@/components/settings/change-password-section";
import { PreferencesCard } from "@/components/settings/preferences-card";
import { SupportCard } from "@/components/settings/support-card";
import { APP_VERSION, getBuildLabel } from "@/lib/version";

/**
 * Impostazioni del collaboratore (issue #1099): il suo accesso, le preferenze
 * del dispositivo e l'assistenza. Attività, credenziali AdE, abbonamento,
 * referral e chiavi API sono del titolare. Export dei dati e cancellazione
 * dell'account arrivano con gli inviti, che danno al collaboratore i suoi
 * dati personali.
 */
export function CollaboratorSettings({
  email,
}: Readonly<{ email: string | undefined }>) {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Impostazioni</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Usi ScontrinoZero come collaboratore: i dati dell&apos;attività, le
            credenziali AdE e l&apos;abbonamento li gestisce il titolare.
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {email}
          </p>
          <div className="border-t pt-4">
            <ChangePasswordSection />
          </div>
        </CardContent>
      </Card>

      <PreferencesCard />

      {/* Senza piano: è del titolare, e la mail di assistenza la manda il
          collaboratore con il suo indirizzo. */}
      <SupportCard accountEmail={email} plan={null} />

      <p className="text-muted-foreground text-sm">
        ScontrinoZero {APP_VERSION} &mdash; build {getBuildLabel()}
      </p>
    </div>
  );
}
