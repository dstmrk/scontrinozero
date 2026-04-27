import { BarChart2 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <BarChart2 className="text-muted-foreground mb-4 h-12 w-12" />
      <h1 className="text-2xl font-bold">Analytics</h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        {
          "La dashboard analytics è in arrivo. Potrai visualizzare l'andamento delle vendite, i totali giornalieri e molto altro."
        }
      </p>
    </div>
  );
}
