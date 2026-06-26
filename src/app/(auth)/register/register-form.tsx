"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { signUp } from "@/server/auth-actions";
import { passwordFieldSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { TurnstileWidget } from "@/components/turnstile-widget";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
  FormPasswordField,
} from "@/components/ui/form";

const registerSchema = z
  .object({
    email: z.string().email("Inserisci un'email valida."),
    password: passwordFieldSchema,
    confirmPassword: z.string().min(1, "Conferma la password."),
    termsAccepted: z
      .boolean()
      .refine(
        (v) => v,
        "Devi accettare i Termini di servizio e la Privacy Policy.",
      ),
    specificClausesAccepted: z
      .boolean()
      .refine((v) => v, "Devi accettare specificamente le clausole indicate."),
    referralCode: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Le password non coincidono.",
    path: ["confirmPassword"],
  });

type RegisterData = z.infer<typeof registerSchema>;

/**
 * Campo referral del form di registrazione. Tre rami mutuamente esclusivi
 * (partner-locked / opzionale aperto / toggle chiuso), estratti in un componente
 * con early-return per evitare un ternario annidato (SonarCloud S3358).
 */
function ReferralField({
  control,
  isPartner,
  partnerLabel,
  showReferralField,
  onShowReferralField,
}: Readonly<{
  control: Control<RegisterData>;
  isPartner: boolean;
  partnerLabel: string | null;
  showReferralField: boolean;
  onShowReferralField: () => void;
}>) {
  if (isPartner) {
    return (
      <FormField
        control={control}
        name="referralCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Codice partner</FormLabel>
            <FormControl>
              <Input
                {...field}
                readOnly
                aria-readonly
                tabIndex={-1}
                className="bg-muted/50 cursor-not-allowed"
                autoComplete="off"
                spellCheck={false}
              />
            </FormControl>
            <FormDescription>
              Stai completando la registrazione tramite{" "}
              <span className="font-medium">{partnerLabel}</span>. Il codice è
              già applicato.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  if (showReferralField) {
    return (
      <FormField
        control={control}
        name="referralCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Codice referral (opzionale)</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="es. AB2CDEFG"
                autoComplete="off"
                spellCheck={false}
              />
            </FormControl>
            <FormDescription>
              Hai un codice da un amico? Inseriscilo per ottenere 1 mese di
              trial extra. Lascia vuoto per registrarti senza.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }

  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={onShowReferralField}
      className="text-muted-foreground hover:text-foreground text-sm underline"
    >
      Hai un codice invito?
    </button>
  );
}

/**
 * Form di registrazione.
 *
 * `forcedReferralCode`/`partnerLabel` sono valorizzati (lato server, dal
 * parent server component) solo sui subdomain partner: in quel caso il campo
 * referral è precompilato e **bloccato** sul codice del partner (force+lock),
 * e ogni iscrizione viene attribuita al partner. Il server ri-verifica
 * comunque il vincolo (`enforcePartnerReferral`) — qui è solo UX.
 */
export function RegisterForm({
  forcedReferralCode,
  partnerLabel,
}: Readonly<{
  forcedReferralCode: string | null;
  partnerLabel: string | null;
}>) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  // Source attribution (?ref=reddit, ?ref=indiehackers, ...) for soft-launch
  // tracking. Validated against allowlist server-side in signup-source.ts.
  // Suspense boundary in the parent RegisterPage required by Next.js for
  // useSearchParams during SSG prerender (CSR bailout).
  const refParam = useSearchParams().get("ref");
  // Codice referral: visibile e modificabile (a differenza di `ref`) perché
  // un codice invalido blocca la registrazione — l'utente deve poterlo
  // correggere o cancellare dal form per procedere senza referral. Sui
  // subdomain partner è invece forzato e bloccato (vedi sotto).
  const rcodeParam = useSearchParams().get("rcode");
  const isPartner = forcedReferralCode !== null;
  // Nascosto dietro un toggle per non appesantire il form per chi non ha un
  // codice (la maggioranza); già aperto se l'utente arriva da un link ?rcode=
  // o se è un subdomain partner (campo bloccato sempre visibile).
  const [showReferralField, setShowReferralField] = useState(
    isPartner || Boolean(rcodeParam),
  );

  const form = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      termsAccepted: false,
      specificClausesAccepted: false,
      referralCode: forcedReferralCode ?? rcodeParam ?? "",
    },
  });

  function handleSubmit(data: RegisterData) {
    const formData = new FormData();
    formData.set("email", data.email);
    formData.set("password", data.password);
    formData.set("confirmPassword", data.confirmPassword);
    formData.set("termsAccepted", "true");
    formData.set("specificClausesAccepted", "true");
    if (captchaToken) formData.set("captchaToken", captchaToken);
    if (refParam) formData.set("ref", refParam);
    // Sui subdomain partner il codice è sempre quello del partner, anche se il
    // campo venisse manomesso lato client (il server lo ri-verifica comunque).
    const referralCode = forcedReferralCode ?? data.referralCode;
    if (referralCode) formData.set("rcode", referralCode);

    startTransition(async () => {
      const result = await signUp(formData);
      if (result?.error) {
        form.setError("root", { message: result.error });
        setCaptchaToken(null); // token single-use, force re-solve
        turnstileRef.current?.reset(); // ri-emette il token: riabilita il submit
      }
      // On success, signUp redirects to /verify-email
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center text-xl">Crea un account</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={(e) => form.handleSubmit(handleSubmit)(e)}
            noValidate
            className="space-y-4"
          >
            <FormInputField
              control={form.control}
              name="email"
              label="Email"
              type="email"
              placeholder="mario@esempio.it…"
              autoComplete="email"
              spellCheck={false}
            />

            {/* password: keeps explicit FormField for the conditional FormDescription */}
            <FormField
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  {!fieldState.error && (
                    <FormDescription>
                      Almeno 8 caratteri con maiuscola, minuscola, numero e
                      carattere speciale (es.&nbsp;!)
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormPasswordField
              control={form.control}
              name="confirmPassword"
              label="Conferma password"
              autoComplete="new-password"
            />

            <FormField
              control={form.control}
              name="termsAccepted"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="termsAccepted"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      className="mt-0.5 shrink-0"
                    />
                    <label
                      htmlFor="termsAccepted"
                      className="cursor-pointer text-sm leading-snug select-none"
                    >
                      Ho letto e accetto i{" "}
                      <Link
                        href="/termini"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Termini di servizio
                      </Link>{" "}
                      e la{" "}
                      <Link
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Privacy Policy
                      </Link>
                      .
                    </label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="specificClausesAccepted"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="specificClausesAccepted"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      className="mt-0.5 shrink-0"
                    />
                    <label
                      htmlFor="specificClausesAccepted"
                      className="cursor-pointer text-sm leading-snug select-none"
                    >
                      Accetto specificamente, ai sensi dell&apos;art. 1341 c.c.,
                      le clausole: 9 (limitazione e cap di responsabilità), 10
                      (no rimborso corrispettivi già pagati), 11 (sospensione e
                      cessazione unilaterale del servizio), 16 (foro esclusivo
                      di Torino per controversie B2B).
                    </label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ReferralField
              control={form.control}
              isPartner={isPartner}
              partnerLabel={partnerLabel}
              showReferralField={showReferralField}
              onShowReferralField={() => setShowReferralField(true)}
            />

            <TurnstileWidget
              ref={turnstileRef}
              onToken={setCaptchaToken}
              action="signup"
            />

            {form.formState.errors.root && (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.root.message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isPending || captchaToken === null}
            >
              {isPending ? "Registrazione…" : "Registrati"}
            </Button>
          </form>
        </Form>

        <p className="mt-4 text-center text-sm">
          Hai già un account?{" "}
          <Link href="/login" className="text-primary underline">
            Accedi
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
