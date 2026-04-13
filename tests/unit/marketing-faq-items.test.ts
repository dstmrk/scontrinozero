import { describe, expect, it } from "vitest";
import { faqItems } from "@/components/marketing/faq-items";

describe("faqItems", () => {
  it("contiene esattamente 12 domande", () => {
    expect(faqItems).toHaveLength(12);
  });

  it("ogni item ha question e answer non vuoti", () => {
    for (const item of faqItems) {
      expect(item.question.trim().length).toBeGreaterThan(0);
      expect(item.answer.trim().length).toBeGreaterThan(0);
    }
  });

  it("nessun item ha question o answer duplicati", () => {
    const questions = faqItems.map((i) => i.question);
    const uniqueQuestions = new Set(questions);
    expect(uniqueQuestions.size).toBe(questions.length);

    const answers = faqItems.map((i) => i.answer);
    const uniqueAnswers = new Set(answers);
    expect(uniqueAnswers.size).toBe(answers.length);
  });

  it("copre la domanda sulla sicurezza delle credenziali Fisconline", () => {
    const credentialsFaq = faqItems.find((i) =>
      i.question.toLowerCase().includes("credenziali"),
    );
    expect(credentialsFaq).toBeDefined();
    expect(credentialsFaq?.answer).toContain("AES-256");
  });

  it("copre la domanda sulla scadenza del trial", () => {
    const trialFaq = faqItems.find((i) =>
      i.question.toLowerCase().includes("scadenza"),
    );
    expect(trialFaq).toBeDefined();
    expect(trialFaq?.answer.toLowerCase()).toContain("sola lettura");
  });

  it("copre la domanda sulla versione self-hosted gratuita", () => {
    const selfHostedFaq = faqItems.find((i) =>
      i.question.toLowerCase().includes("gratuita"),
    );
    expect(selfHostedFaq).toBeDefined();
    expect(selfHostedFaq?.answer.toLowerCase()).toContain("open source");
  });
});
