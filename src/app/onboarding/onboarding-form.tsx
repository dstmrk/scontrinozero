"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveBusiness,
  saveAdeCredentials,
  verifyAdeCredentials,
} from "@/server/onboarding-actions";
import { VAT_CODES, VAT_DESCRIPTIONS } from "@/types/cassa";

const STEPS = ["Dati attivita", "Credenziali AdE", "Verifica"];

const step1Schema = z.object({
  businessName: z.string().optional(),
  firstName: z.string().min(1, "Il nome è obbligatorio."),
  lastName: z.string().min(1, "Il cognome è obbligatorio."),
  address: z.string().min(1, "L'indirizzo è obbligatorio."),
  streetNumber: z.string().optional(),
  zipCode: z
    .string()
    .regex(/^\d{5}$/, "CAP non valido (5 cifre numeriche)."),
  city: z.string().optional(),
  province: z.string().optional(),
  preferredVatCode: z.string().optional(),
});

const step2Schema = z.object({
  codiceFiscale: z
    .string()
    .min(16, "Codice fiscale non valido (16 caratteri).")
    .max(16, "Codice fiscale non valido (16 caratteri)."),
  password: z.string().min(1, "La password Fisconline è obbligatoria."),
  pin: z.string().min(6, "Il PIN deve essere di almeno 6 caratteri."),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;

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

interface OnboardingFormProps {
  initialStep: number;
  initialBusinessId: string | null;
}

export function OnboardingForm({
  initialStep,
  initialBusinessId,
}: Readonly<OnboardingFormProps>) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [businessId, setBusinessId] = useState<string | null>(
    initialBusinessId,
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const step1Form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      businessName: "",
      firstName: "",
      lastName: "",
      address: "",
      streetNumber: "",
      zipCode: "",
      city: "",
      province: "",
      preferredVatCode: "",
    },
  });

  const step2Form = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      codiceFiscale: "",
      password: "",
      pin: "",
    },
  });

  function handleBusinessSubmit(data: Step1Data) {
    const formData = new FormData();
    formData.set("businessName", data.businessName ?? "");
    formData.set("firstName", data.firstName);
    formData.set("lastName", data.lastName);
    formData.set("address", data.address);
    formData.set("streetNumber", data.streetNumber ?? "");
    formData.set("zipCode", data.zipCode);
    formData.set("city", data.city ?? "");
    formData.set("province", data.province ?? "");
    formData.set("preferredVatCode", data.preferredVatCode ?? "");
    formData.set("nation", "IT");

    startTransition(async () => {
      const result = await saveBusiness(formData);
      if (result.error) {
        step1Form.setError("root", { message: result.error });
        return;
      }
      setBusinessId(result.businessId!);
      setStep(1);
    });
  }

  function handleCredentialsSubmit(data: Step2Data) {
    if (!businessId) return;
    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("codiceFiscale", data.codiceFiscale);
    formData.set("password", data.password);
    formData.set("pin", data.pin);

    startTransition(async () => {
      const result = await saveAdeCredentials(formData);
      if (result.error) {
        step2Form.setError("root", { message: result.error });
        return;
      }
      setStep(2);
    });
  }

  function handleVerify() {
    setVerifyError(null);
    if (!businessId) return;
    const id = businessId;
    startTransition(async () => {
      const result = await verifyAdeCredentials(id);
      if (result.error) {
        setVerifyError(result.error);
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
          {step === 0 && (
            <Form {...step1Form}>
              <form
                onSubmit={step1Form.handleSubmit(handleBusinessSubmit)}
                className="space-y-4"
                noValidate
              >
                <FormField
                  control={step1Form.control}
                  name="businessName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome attività</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Es. Pizzeria Da Mario (opzionale)"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={step1Form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome *</FormLabel>
                        <FormControl>
                          <Input placeholder="Mario…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={step1Form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cognome *</FormLabel>
                        <FormControl>
                          <Input placeholder="Rossi…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={step1Form.control}
                  name="preferredVatCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Aliquota IVA prevalente</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleziona (opzionale)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {VAT_CODES.map((code) => (
                            <SelectItem key={code} value={code}>
                              {VAT_DESCRIPTIONS[code]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={step1Form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Indirizzo *</FormLabel>
                        <FormControl>
                          <Input placeholder="Via Roma…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={step1Form.control}
                    name="streetNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>N. civico</FormLabel>
                        <FormControl>
                          <Input placeholder="1…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={step1Form.control}
                    name="zipCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CAP *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="00100…"
                            maxLength={5}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={step1Form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Città</FormLabel>
                        <FormControl>
                          <Input placeholder="Roma…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={step1Form.control}
                    name="province"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prov.</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="RM…"
                            maxLength={2}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {step1Form.formState.errors.root && (
                  <p className="text-destructive text-sm" role="alert">
                    {step1Form.formState.errors.root.message}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Salvataggio…" : "Continua"}
                </Button>
              </form>
            </Form>
          )}

          {step === 1 && (
            <Form {...step2Form}>
              <form
                onSubmit={step2Form.handleSubmit(handleCredentialsSubmit)}
                className="space-y-4"
                noValidate
              >
                <p className="text-muted-foreground text-sm">
                  Inserisci le credenziali Fisconline per l&apos;invio dei
                  corrispettivi all&apos;Agenzia delle Entrate. Le credenziali
                  vengono cifrate e conservate in modo sicuro.
                </p>

                <FormField
                  control={step2Form.control}
                  name="codiceFiscale"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Codice fiscale *</FormLabel>
                      <FormControl>
                        <Input
                          maxLength={16}
                          spellCheck={false}
                          autoComplete="off"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e.target.value.toUpperCase());
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={step2Form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password Fisconline *</FormLabel>
                      <FormControl>
                        <PasswordInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={step2Form.control}
                  name="pin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PIN Fisconline *</FormLabel>
                      <FormControl>
                        <PasswordInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {step2Form.formState.errors.root && (
                  <p className="text-destructive text-sm" role="alert">
                    {step2Form.formState.errors.root.message}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(0)}
                  >
                    Indietro
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={isPending}
                  >
                    {isPending ? "Salvataggio…" : "Continua"}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {step === 2 && (
            <div className="space-y-4 text-center">
              <p className="text-muted-foreground text-sm">
                Verifica che le credenziali funzionino effettuando un test di
                connessione all&apos;Agenzia delle Entrate.
              </p>

              {verifyError && (
                <p className="text-destructive text-sm" role="alert">
                  {verifyError}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Button onClick={handleVerify} disabled={isPending}>
                  {isPending ? "Verifica in corso…" : "Verifica connessione"}
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
                onClick={() => setStep(1)}
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
