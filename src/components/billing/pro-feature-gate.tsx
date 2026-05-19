import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canUsePro, type Plan } from "@/lib/plans-shared";

interface ProFeatureGateProps {
  readonly plan: Plan;
  readonly children: React.ReactNode;
  readonly title?: string;
  readonly description?: string;
}

const DEFAULT_TITLE = "Disponibile sul piano Pro";
const DEFAULT_DESCRIPTION =
  "Questa funzionalità è inclusa nel piano Pro. Passa a Pro per sbloccarla.";

export function ProFeatureGate({
  plan,
  children,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
}: ProFeatureGateProps) {
  if (canUsePro(plan)) {
    return <>{children}</>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href="/dashboard/settings#billing">Passa a Pro</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
