import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { profiles, businesses, adeCredentials } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const db = getDb();

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.authUserId, user.id))
    .limit(1);

  const business = profile
    ? (
        await db
          .select()
          .from(businesses)
          .where(eq(businesses.profileId, profile.id))
          .limit(1)
      )[0]
    : null;

  const cred = business
    ? (
        await db
          .select({ verifiedAt: adeCredentials.verifiedAt })
          .from(adeCredentials)
          .where(eq(adeCredentials.businessId, business.id))
          .limit(1)
      )[0]
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Impostazioni</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profilo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>
            <span className="text-muted-foreground">Nome:</span>{" "}
            {profile?.fullName || "Non impostato"}
          </p>
          <p>
            <span className="text-muted-foreground">Email:</span> {user.email}
          </p>
        </CardContent>
      </Card>

      {business && (
        <Card>
          <CardHeader>
            <CardTitle>Attivita</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              <span className="text-muted-foreground">Nome:</span>{" "}
              {business.businessName}
            </p>
            <p>
              <span className="text-muted-foreground">P.IVA:</span>{" "}
              {business.vatNumber}
            </p>
            {business.fiscalCode && (
              <p>
                <span className="text-muted-foreground">C.F.:</span>{" "}
                {business.fiscalCode}
              </p>
            )}
            {business.city && (
              <p>
                <span className="text-muted-foreground">Sede:</span>{" "}
                {business.address && `${business.address}, `}
                {business.city} {business.province && `(${business.province})`}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Credenziali AdE</CardTitle>
        </CardHeader>
        <CardContent>
          {cred ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Stato:</span>
              {cred.verifiedAt ? (
                <Badge variant="default">Verificate</Badge>
              ) : (
                <Badge variant="secondary">Non verificate</Badge>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">
              Nessuna credenziale configurata.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
