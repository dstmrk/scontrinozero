export function PlanBadge({ plan }: Readonly<{ plan: string }>) {
  const labels: Record<string, string> = {
    trial: "Prova gratuita",
    starter: "Starter",
    pro: "Pro",
    unlimited: "Unlimited",
  };
  return (
    <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-sm font-medium">
      {labels[plan] ?? plan}
    </span>
  );
}
