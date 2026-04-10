import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/marketing/pricing-section";

export const metadata: Metadata = {
  title: "Prezzi",
  description:
    "Starter da €29,99/anno, Pro da €49,99/anno. 30 giorni di prova gratuita, nessuna carta di credito richiesta. Versione self-hosted disponibile gratuitamente.",
  openGraph: {
    title: "Prezzi ScontrinoZero | Starter €29,99/anno · Pro €49,99/anno",
    description:
      "Starter da €29,99/anno, Pro da €49,99/anno. 30 giorni di prova gratuita, nessuna carta di credito richiesta. Versione self-hosted gratuita.",
  },
};

const comparisonRows: {
  label: string;
  starter: string | boolean;
  pro: string | boolean;
  selfHosted: string | boolean;
}[] = [
  {
    label: "Scontrini illimitati",
    starter: true,
    pro: true,
    selfHosted: true,
  },
  {
    label: "Trasmissione automatica AdE",
    starter: true,
    pro: true,
    selfHosted: true,
  },
  {
    label: "Lotteria degli Scontrini",
    starter: true,
    pro: true,
    selfHosted: true,
  },
  {
    label: "Condivisione digitale (SMS/email/WhatsApp)",
    starter: true,
    pro: true,
    selfHosted: true,
  },
  {
    label: "Analytics base",
    starter: true,
    pro: true,
    selfHosted: true,
  },
  {
    label: "Catalogo prodotti rapido",
    starter: "Fino a 5",
    pro: "Illimitato",
    selfHosted: "Illimitato",
  },
  {
    label: "Analytics avanzata",
    starter: false,
    pro: "In arrivo",
    selfHosted: "In arrivo",
  },
  {
    label: "Export CSV scontrini",
    starter: false,
    pro: "In arrivo",
    selfHosted: "In arrivo",
  },
  {
    label: "Recupero documenti da AdE",
    starter: false,
    pro: "In arrivo",
    selfHosted: "In arrivo",
  },
  {
    label: "Supporto prioritario",
    starter: false,
    pro: true,
    selfHosted: false,
  },
  {
    label: "Hosting incluso",
    starter: true,
    pro: true,
    selfHosted: false,
  },
  {
    label: "Aggiornamenti automatici",
    starter: true,
    pro: true,
    selfHosted: false,
  },
];

const pricingFaqs: { question: string; answer: string }[] = [
  {
    question: "Posso cambiare piano in qualsiasi momento?",
    answer:
      "Sì. Puoi passare da Starter a Pro o viceversa in qualsiasi momento dal pannello di controllo. Le modifiche entrano in vigore immediatamente.",
  },
  {
    question: "Emetto fattura o ricevuta del pagamento?",
    answer:
      "Sì. Per ogni addebito ricevi una ricevuta di pagamento via email. Se hai bisogno di fattura, contattaci a info@scontrinozero.it.",
  },
  {
    question: "Cosa succede se smetto di pagare?",
    answer:
      "L'account passa in modalità sola lettura: puoi consultare lo storico dei tuoi scontrini ma non puoi emetterne di nuovi. I tuoi dati rimangono al sicuro e puoi riattivare l'abbonamento in qualsiasi momento.",
  },
  {
    question: "La versione self-hosted è davvero gratuita per sempre?",
    answer:
      "Sì. ScontrinoZero è open source con licenza O'Saasy. Puoi scaricarlo, installarlo sul tuo server e usarlo senza limiti di tempo o funzionalità. Non include hosting, aggiornamenti automatici o supporto dedicato.",
  },
];

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return <Check className="text-primary mx-auto h-4 w-4" />;
  }
  if (value === false) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="text-muted-foreground text-sm">{value}</span>;
}

export default function PrezziPage() {
  return (
    <>
      {/* Hero */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
            Scegli il piano giusto
            <br />
            <span className="text-primary">per la tua attività</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg">
            30 giorni di prova gratuita su tutti i piani. Nessuna carta di
            credito richiesta per iniziare.
          </p>
        </div>
      </section>

      {/* Pricing toggle + cards */}
      <PricingSection />

      {/* Comparison table */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold">
            Confronto completo dei piani
          </h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-center">
            Incluso self-hosted gratuito per chi preferisce gestire il proprio
            server.
          </p>
          <div className="mt-10 overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold"></th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Starter
                  </th>
                  <th className="text-primary px-4 py-3 text-center font-semibold">
                    Pro
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Self-hosted
                  </th>
                </tr>
                <tr className="border-t">
                  <td className="text-muted-foreground px-4 py-2 text-xs"></td>
                  <td className="px-4 py-2 text-center">
                    <span className="font-semibold">€29,99/anno</span>
                    <span className="text-muted-foreground block text-xs">
                      o €4,99/mese
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="text-primary font-semibold">
                      €49,99/anno
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      o €8,99/mese
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="font-semibold">€0</span>
                    <span className="text-muted-foreground block text-xs">
                      per sempre
                    </span>
                  </td>
                </tr>
              </thead>
              <tbody className="divide-y">
                {comparisonRows.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-3">{row.label}</td>
                    <td className="px-4 py-3 text-center">
                      <CellValue value={row.starter} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <CellValue value={row.pro} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <CellValue value={row.selfHosted} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ prezzi */}
      <section className="bg-muted/50 px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold">Domande sui prezzi</h2>
          <div className="mt-8 space-y-6">
            {pricingFaqs.map((faq) => (
              <div key={faq.question}>
                <h3 className="font-semibold">{faq.question}</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA finale */}
      <section className="px-4 py-16 text-center">
        <h2 className="text-2xl font-bold">Inizia gratis, senza impegno</h2>
        <p className="text-muted-foreground mt-2">
          30 giorni per provare tutto. Nessuna carta richiesta.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/register" prefetch={false}>
            Inizia i 30 giorni gratis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>
    </>
  );
}
