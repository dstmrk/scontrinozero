import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountDeleteSection } from "@/components/settings/account-delete-section";
import { ChangePasswordSection } from "@/components/settings/change-password-section";
import { ExportDataSection } from "@/components/settings/export-data-section";
import { ExtraSettingsSection } from "@/components/settings/extra-settings-section";
import { PreferencesCard } from "@/components/settings/preferences-card";
import { SupportCard } from "@/components/settings/support-card";
import { APP_VERSION, getBuildLabel } from "@/lib/version";

/**
 * Impostazioni del collaboratore (issue #1099): il suo accesso, le preferenze
 * del dispositivo, l'assistenza, l'export dei suoi dati e l'uscita
 * dall'attività. Attività, credenziali AdE, abbonamento, referral e chiavi API
 * sono del titolare. Export e cancellazione sono le stesse sezioni del
 * titolare, che scelgono testo e action dal ruolo.
 */
export function CollaboratorSettings({
  email,
  plan,
}: Readonly<{ email: string | undefined; plan: string | null }>) {
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

      <SupportCard accountEmail={email} plan={plan} />

      <ExtraSettingsSection>
        <ExportDataSection />

        <AccountDeleteSection />

        <p className="text-muted-foreground text-sm">
          ScontrinoZero {APP_VERSION} &mdash; build {getBuildLabel()}
        </p>
      </ExtraSettingsSection>
    </div>
  );
}
