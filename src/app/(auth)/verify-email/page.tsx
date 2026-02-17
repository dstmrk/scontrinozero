import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">
          Controlla la tua email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-muted-foreground text-sm">
          Ti abbiamo inviato un&apos;email con un link di conferma. Clicca sul
          link per completare l&apos;operazione.
        </p>
        <p className="text-muted-foreground text-xs">
          Non trovi l&apos;email? Controlla la cartella spam.
        </p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/login">Torna al login</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
