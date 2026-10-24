import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupportSection } from "@/components/settings/support-section";
import { APP_VERSION } from "@/lib/version";

/** Assistenza: Help Center e contatto email pre-compilato. */
export function SupportCard({
  accountEmail,
  plan,
}: Readonly<{
  accountEmail: string | null | undefined;
  plan: string | null | undefined;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assistenza</CardTitle>
      </CardHeader>
      <CardContent>
        <SupportSection
          accountEmail={accountEmail}
          plan={plan}
          appVersion={APP_VERSION}
        />
      </CardContent>
    </Card>
  );
}
