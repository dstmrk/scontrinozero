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
import { faqItems } from "./faq-items";

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
