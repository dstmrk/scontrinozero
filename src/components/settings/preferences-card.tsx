import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrinterSection } from "@/components/settings/printer-section";
import { ThemeSection } from "@/components/settings/theme-section";

/**
 * Aspetto e stampante in una card sola: due controlli brevi (tre bottoni tema,
 * un abbinamento BT) che da soli non giustificavano un header di card
 * ciascuno. Sono preferenze del dispositivo, uguali per titolare e
 * collaboratore.
 */
export function PreferencesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferenze</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-medium">Aspetto</h3>
          <ThemeSection />
        </div>
        <div className="border-t pt-6">
          <h3 className="mb-3 text-sm font-medium">Stampante</h3>
          <PrinterSection />
        </div>
      </CardContent>
    </Card>
  );
}
