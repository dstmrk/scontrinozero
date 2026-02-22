"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const faqItems = [
  {
    question: "Serve per forza un registratore telematico fisico?",
    answer:
      "No. ScontrinoZero nasce per permetterti di emettere documento commerciale e trasmettere i corrispettivi senza cassa fisica, usando i canali previsti dall'Agenzia delle Entrate.",
  },
  {
    question: "ScontrinoZero è adatto alla mia attività?",
    answer:
      "Sì, è pensato per ambulanti, artigiani, professionisti e micro-attività che vogliono una soluzione semplice, economica e utilizzabile da smartphone o PC.",
  },
  {
    question: "Il servizio è conforme alla normativa italiana?",
    answer:
      "ScontrinoZero è progettato per seguire i flussi previsti dall'Agenzia delle Entrate per documento commerciale e corrispettivi telematici. Resta sempre responsabilità dell'utente verificare i dati inseriti e gli esiti delle trasmissioni.",
  },
  {
    question: "Serve una connessione internet per usarlo?",
    answer:
      "Sì. Per inviare i dati ai servizi telematici e sincronizzare la tua operatività, è necessaria una connessione internet attiva.",
  },
  {
    question: "Posso emettere e condividere lo scontrino in modo digitale?",
    answer:
      "Sì. Puoi generare il documento commerciale e condividerlo in formato digitale. Se necessario, puoi anche usare una stampante compatibile per consegna cartacea.",
  },
  {
    question: "Quanto costa?",
    answer:
      "La beta è gratuita. Al lancio ci saranno piani a pagamento, ma resterà comunque disponibile un'opzione gratuita per chi ha volumi piccoli.",
  },
  {
    question: "Posso provarlo prima del lancio ufficiale?",
    answer:
      "Sì. Iscrivendoti alla lista d'attesa puoi accedere in anteprima e ricevere aggiornamenti sulle nuove funzionalità.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mt-10 space-y-4">
      {faqItems.map((item, index) => {
        const isOpen = openIndex === index;

        return (
          <Card
            key={item.question}
            className="border-border/50 gap-0 overflow-hidden py-0 transition-shadow duration-300 hover:shadow-sm"
          >
            <button
              type="button"
              className="w-full py-4 text-left"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-0">
                <CardTitle className="text-base">{item.question}</CardTitle>
                <ChevronDown
                  className={`text-muted-foreground h-5 w-5 shrink-0 transition-transform duration-300 ${
                    isOpen ? "rotate-180" : "rotate-0"
                  }`}
                />
              </CardHeader>
            </button>

            <div
              className={`grid transition-all duration-300 ease-out ${
                isOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <CardContent className="pt-3 pb-4">
                  <CardDescription className="text-sm leading-relaxed">
                    {item.answer}
                  </CardDescription>
                </CardContent>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
