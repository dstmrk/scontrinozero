import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Benvenuto</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            La dashboard di ScontrinoZero e in fase di sviluppo. Presto potrai
            emettere scontrini elettronici direttamente da qui.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Account: {user?.email}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
