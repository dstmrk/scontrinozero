"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { adePinSchema, italianZipCodeSchema } from "@/lib/validation";
import { objectToFormData } from "@/lib/form-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
  FormPasswordField,
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
import { BILLING_SETTINGS_HREF } from "@/lib/plans-shared";

const STEPS = ["Dati attivita", "Credenziali AdE", "Verifica"];

const step1Schema = z.object({
  businessName: z.string().optional(),
  firstName: z.string().min(1, "Il nome è obbligatorio."),
  lastName: z.string().min(1, "Il cognome è obbligatorio."),
  address: z.string().min(1, "L'indirizzo è obbligatorio."),
  streetNumber: z.string().optional(),
  zipCode: italianZipCodeSchema,
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
  pin: adePinSchema,
});

const cieSchema = z.object({
  username: z.email("Inserisci l'email dell'app CIE ID."),
  password: z.string().min(1, "La password CIE è obbligatoria."),
});

type AdeMethod = "fisconline" | "cie";
type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type CieData = z.infer<typeof cieSchema>;

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
  const [verifyPivaConflict, setVerifyPivaConflict] = useState(false);
  const [trialAlreadyUsed, setTrialAlreadyUsed] = useState(false);
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
    defaultValues: { codiceFiscale: "", password: "", pin: "" },
  });

  // Metodo di accesso AdE: Fisconline è il default; "Altre opzioni" rivela CIE.
  const [method, setMethod] = useState<AdeMethod>("fisconline");
  const cieForm = useForm<CieData>({
    resolver: zodResolver(cieSchema),
    defaultValues: { username: "", password: "" },
  });

  function handleBusinessSubmit(data: Step1Data) {
    const formData = objectToFormData({ ...data, nation: "IT" });

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
    const formData = objectToFormData({
      businessId,
      loginMethod: "fisconline",
      ...data,
    });

    startTransition(async () => {
      const result = await saveAdeCredentials(formData);
      if (result.error) {
        step2Form.setError("root", { message: result.error });
        return;
      }
      setStep(2);
    });
  }

  function handleCieSubmit(data: CieData) {
    if (!businessId) return;
    const formData = objectToFormData({
      businessId,
      loginMethod: "cie",
      ...data,
    });

    startTransition(async () => {
      const result = await saveAdeCredentials(formData);
      if (result.error) {
        cieForm.setError("root", { message: result.error });
        return;
      }
      setStep(2);
    });
  }

  function handleVerify() {
    setVerifyError(null);
    setVerifyPivaConflict(false);
    setTrialAlreadyUsed(false);
    if (!businessId) return;
    const id = businessId;
    startTransition(async () => {
      const result = await verifyAdeCredentials(id);
      if (result.error) {
        setVerifyError(result.error);
        setVerifyPivaConflict(!!result.pivaConflict);
        return;
      }
      if (result.trialAlreadyUsed) {
        // Onboarding completato ma trial già consumato per questa P.IVA:
        // niente redirect automatico, mostriamo il motivo e l'invito ad
        // attivare un piano prima di entrare (già in sola lettura).
        setTrialAlreadyUsed(true);
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
                <FormInputField
                  control={step1Form.control}
                  name="businessName"
                  label="Nome attività"
                  placeholder="Es. Pizzeria Da Mario (opzionale)"
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormInputField
                    control={step1Form.control}
                    name="firstName"
                    label="Nome *"
                    placeholder="Mario…"
                  />
                  <FormInputField
                    control={step1Form.control}
                    name="lastName"
                    label="Cognome *"
                    placeholder="Rossi…"
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
                  <FormInputField
                    control={step1Form.control}
                    name="address"
                    label="Indirizzo *"
                    placeholder="Via Roma…"
                    itemClassName="col-span-2"
                  />
                  <FormInputField
                    control={step1Form.control}
                    name="streetNumber"
                    label="N. civico"
                    placeholder="1…"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormInputField
                    control={step1Form.control}
                    name="zipCode"
                    label="CAP *"
                    placeholder="00100…"
                    maxLength={5}
                  />
                  <FormInputField
                    control={step1Form.control}
                    name="city"
                    label="Città"
                    placeholder="Roma…"
                  />
                  <FormInputField
                    control={step1Form.control}
                    name="province"
                    label="Prov."
                    placeholder="RM…"
                    maxLength={2}
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

          {step === 1 && method === "fisconline" && (
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

                {/* codiceFiscale needs a custom onChange (uppercase transform) */}
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

                <FormPasswordField
                  control={step2Form.control}
                  name="password"
                  label="Password Fisconline *"
                />

                <FormPasswordField
                  control={step2Form.control}
                  name="pin"
                  label="PIN Fisconline *"
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
                  <Button type="submit" className="flex-1" disabled={isPending}>
                    {isPending ? "Salvataggio…" : "Continua"}
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setMethod("cie")}
                  className="text-muted-foreground hover:text-foreground w-full text-center text-sm underline underline-offset-2"
                >
                  Altre opzioni di accesso
                </button>
              </form>
            </Form>
          )}

          {step === 1 && method === "cie" && (
            <Form {...cieForm}>
              <form
                onSubmit={cieForm.handleSubmit(handleCieSubmit)}
                className="space-y-4"
                noValidate
              >
                <p className="text-muted-foreground text-sm">
                  Accedi con <strong>CIE</strong> usando le credenziali
                  dell&apos;app <strong>CIE ID</strong> (email e password). Dopo
                  il salvataggio ti chiederemo di approvare la notifica
                  sull&apos;app per completare il collegamento all&apos;Agenzia
                  delle Entrate.
                </p>

                <FormInputField
                  control={cieForm.control}
                  name="username"
                  label="Email dell'app CIE ID *"
                  placeholder="La tua email registrata su CIE ID"
                />

                <FormPasswordField
                  control={cieForm.control}
                  name="password"
                  label="Password CIE ID *"
                />

                {cieForm.formState.errors.root && (
                  <p className="text-destructive text-sm" role="alert">
                    {cieForm.formState.errors.root.message}
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
                  <Button type="submit" className="flex-1" disabled={isPending}>
                    {isPending ? "Salvataggio…" : "Continua"}
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setMethod("fisconline")}
                  className="text-muted-foreground hover:text-foreground w-full text-center text-sm underline underline-offset-2"
                >
                  Usa invece le credenziali Fisconline
                </button>
              </form>
            </Form>
          )}

          {step === 2 && (
            <div className="space-y-4 text-center">
              <p className="text-muted-foreground text-sm">
                {method === "cie"
                  ? "Avvia il test di connessione, poi approva entro circa un minuto la notifica sull'app CIE ID sul tuo telefono per completare il collegamento all'Agenzia delle Entrate."
                  : "Verifica che le credenziali funzionino effettuando un test di connessione all'Agenzia delle Entrate."}
              </p>

              {verifyError && (
                <div className="space-y-1">
                  <p className="text-destructive text-sm" role="alert">
                    {verifyError}
                  </p>
                  {verifyPivaConflict && (
                    <p className="text-muted-foreground text-xs">
                      Se questa P.IVA è tua (es. un vecchio account o un trial
                      abbandonato),{" "}
                      <a
                        href="/help/contatto-assistenza"
                        className="underline underline-offset-2"
                      >
                        contatta l&apos;assistenza
                      </a>{" "}
                      per sbloccarla.
                    </p>
                  )}
                </div>
              )}

              {trialAlreadyUsed ? (
                <div className="space-y-3">
                  <p className="text-sm" role="alert">
                    Hai già utilizzato il periodo di prova con questa P.IVA.
                    L&apos;account è attivo in sola lettura: attiva un piano per
                    tornare a emettere scontrini.
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => router.push(BILLING_SETTINGS_HREF)}>
                      Attiva un piano
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => router.push("/dashboard")}
                    >
                      Vai al pannello
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Button onClick={handleVerify} disabled={isPending}>
                      {isPending
                        ? "Verifica in corso…"
                        : "Verifica connessione"}
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
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
