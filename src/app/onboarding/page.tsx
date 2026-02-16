"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveBusiness,
  saveAdeCredentials,
  verifyAdeCredentials,
} from "@/server/onboarding-actions";

const STEPS = ["Dati attivita", "Credenziali AdE", "Verifica"];

function StepIndicator({ current }: Readonly<{ current: number }>) {
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              i <= current
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
          <span
            className={`hidden text-sm sm:inline ${
              i <= current ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div
              className={`h-0.5 w-8 ${i < current ? "bg-primary" : "bg-muted"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleBusinessSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveBusiness(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setBusinessId(result.businessId!);
      setStep(1);
    });
  }

  function handleCredentialsSubmit(formData: FormData) {
    setError(null);
    if (businessId) {
      formData.set("businessId", businessId);
    }
    startTransition(async () => {
      const result = await saveAdeCredentials(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStep(2);
    });
  }

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const result = await verifyAdeCredentials(businessId!);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/dashboard");
    });
  }

  function handleSkipVerify() {
    router.push("/dashboard");
  }

  return (
    <>
      <StepIndicator current={step} />

      <Card>
        <CardHeader>
          <CardTitle className="text-center text-lg">{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

          {step === 0 && (
            <form action={handleBusinessSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Nome attivita *</Label>
                <Input
                  id="businessName"
                  name="businessName"
                  required
                  placeholder="Es. Pizzeria Da Mario"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vatNumber">Partita IVA *</Label>
                <Input
                  id="vatNumber"
                  name="vatNumber"
                  required
                  maxLength={11}
                  placeholder="12345678901"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscalCode">Codice fiscale</Label>
                <Input
                  id="fiscalCode"
                  name="fiscalCode"
                  maxLength={16}
                  placeholder="RSSMRA80A01H501U"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Citta</Label>
                  <Input id="city" name="city" placeholder="Roma" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="province">Provincia</Label>
                  <Input
                    id="province"
                    name="province"
                    maxLength={2}
                    placeholder="RM"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2 sm:col-span-1">
                  <Label htmlFor="address">Indirizzo</Label>
                  <Input id="address" name="address" placeholder="Via Roma 1" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipCode">CAP</Label>
                  <Input
                    id="zipCode"
                    name="zipCode"
                    maxLength={5}
                    placeholder="00100"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Salvataggio..." : "Continua"}
              </Button>
            </form>
          )}

          {step === 1 && (
            <form action={handleCredentialsSubmit} className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Inserisci le credenziali Fisconline per l&apos;invio dei
                corrispettivi all&apos;Agenzia delle Entrate. Le credenziali
                vengono cifrate e conservate in modo sicuro.
              </p>
              <div className="space-y-2">
                <Label htmlFor="codiceFiscale">Codice fiscale *</Label>
                <Input
                  id="codiceFiscale"
                  name="codiceFiscale"
                  required
                  maxLength={16}
                  placeholder="RSSMRA80A01H501U"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password Fisconline *</Label>
                <Input id="password" name="password" type="password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">PIN Fisconline *</Label>
                <Input
                  id="pin"
                  name="pin"
                  type="password"
                  required
                  minLength={6}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep(0);
                    setError(null);
                  }}
                >
                  Indietro
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? "Salvataggio..." : "Continua"}
                </Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4 text-center">
              <p className="text-muted-foreground text-sm">
                Verifica che le credenziali funzionino effettuando un test di
                connessione all&apos;Agenzia delle Entrate.
              </p>

              <div className="flex flex-col gap-2">
                <Button onClick={handleVerify} disabled={isPending}>
                  {isPending ? "Verifica in corso..." : "Verifica connessione"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleSkipVerify}
                  disabled={isPending}
                >
                  Salta per ora
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                className="mt-2"
              >
                Modifica credenziali
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
