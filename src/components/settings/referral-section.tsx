import { ShareButton } from "@/app/r/[documentId]/share-button";

interface ReferralSectionProps {
  readonly referralCode: string;
  readonly completedReferrals: number;
}

export function ReferralSection({
  referralCode,
  completedReferrals,
}: ReferralSectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Invita un amico: chi si registra con il tuo codice ottiene 1 mese di
        trial extra, e tu ricevi 1 mese in più sul tuo piano quando completa la
        verifica della P.IVA.
      </p>
      <div className="bg-muted flex items-center justify-between rounded-md border px-3 py-2">
        <span className="font-mono text-sm tracking-wider">{referralCode}</span>
      </div>
      <ShareButton
        url={`/register?rcode=${referralCode}`}
        title="Unisciti a ScontrinoZero"
        label="Condividi codice referral"
        copiedLabel="Link copiato!"
      />
      {completedReferrals > 0 && (
        <p className="text-muted-foreground text-xs">
          Referral completati: {completedReferrals}
        </p>
      )}
    </div>
  );
}
