"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormInputField,
  FormPasswordField,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveAdeCredentials } from "@/server/onboarding-actions";
import type { AdeLoginMethod } from "@/lib/ade/types";
import { EditSettingsDialog } from "./edit-settings-dialog";

// Form unico con campo `method`: la validazione dipende dal metodo scelto
// (superRefine). Evita il tipo union su <Form> di due schemi separati.
// SPID non è supportato dalla PWA: solo Fisconline e CIE.
const editAdeSchema = z
  .object({
    method: z.enum(["fisconline", "cie"]),
    codiceFiscale: z.string(),
    pin: z.string(),
    username: z.string(),
    password: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.password) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "La password è obbligatoria.",
      });
    }
    if (data.method === "cie") {
      if (!z.email().safeParse(data.username).success) {
        ctx.addIssue({
          code: "custom",
          path: ["username"],
          message: "Inserisci l'email dell'app CIE ID.",
        });
      }
    } else {
      if (data.codiceFiscale.length !== 16) {
        ctx.addIssue({
          code: "custom",
          path: ["codiceFiscale"],
          message: "Codice fiscale non valido (16 caratteri).",
        });
      }
      if (!/^\d{10}$/.test(data.pin)) {
        ctx.addIssue({
          code: "custom",
          path: ["pin"],
          message: "Il PIN Fisconline è composto da 10 cifre numeriche.",
        });
      }
    }
  });

type EditAdeData = z.infer<typeof editAdeSchema>;

interface EditAdeCredentialsSectionProps {
  readonly businessId: string;
  /** Metodo attualmente salvato: preseleziona il toggle. */
  readonly currentMethod?: AdeLoginMethod;
}

export function EditAdeCredentialsSection({
  businessId,
  currentMethod = "fisconline",
}: EditAdeCredentialsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const defaultMethod: "fisconline" | "cie" =
    currentMethod === "cie" ? "cie" : "fisconline";

  const form = useForm<EditAdeData>({
    resolver: zodResolver(editAdeSchema),
    defaultValues: {
      method: defaultMethod,
      codiceFiscale: "",
      pin: "",
      username: "",
      password: "",
    },
  });

  const method = useWatch({ control: form.control, name: "method" });

  const mutation = useMutation({
    mutationFn: (data: EditAdeData) => {
      const fd = new FormData();
      fd.set("businessId", businessId);
      fd.set("loginMethod", data.method);
      fd.set("password", data.password);
      if (data.method === "cie") {
        fd.set("username", data.username);
      } else {
        fd.set("codiceFiscale", data.codiceFiscale);
        fd.set("pin", data.pin);
      }
      return saveAdeCredentials(fd);
    },
    onSuccess: (result) => {
      if (result.error) {
        form.setError("root", { message: result.error });
      } else {
        setIsOpen(false);
        router.refresh();
      }
    },
    onError: () => {
      form.setError("root", {
        message: "Si è verificato un errore. Riprova più tardi.",
      });
    },
  });

  function handleOpen() {
    form.reset({
      method: defaultMethod,
      codiceFiscale: "",
      pin: "",
      username: "",
      password: "",
    });
    setIsOpen(true);
  }

  return (
    <Form {...form}>
      <EditSettingsDialog
        ariaLabel="Modifica credenziali AdE"
        title="Modifica credenziali AdE"
        description="Scegli il metodo di accesso e inserisci le nuove credenziali. Dopo il salvataggio dovrai riverificare la connessione con l'AdE."
        isOpen={isOpen}
        isPending={mutation.isPending}
        rootError={form.formState.errors.root?.message}
        onOpen={handleOpen}
        onClose={() => setIsOpen(false)}
        onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
      >
        {/* Selettore metodo: Fisconline (default) / CIE. */}
        <div className="flex gap-2" role="group" aria-label="Metodo di accesso">
          <Button
            type="button"
            variant={method === "fisconline" ? "default" : "outline"}
            size="sm"
            className="flex-1"
            disabled={mutation.isPending}
            onClick={() => form.setValue("method", "fisconline")}
          >
            Fisconline
          </Button>
          <Button
            type="button"
            variant={method === "cie" ? "default" : "outline"}
            size="sm"
            className="flex-1"
            disabled={mutation.isPending}
            onClick={() => form.setValue("method", "cie")}
          >
            CIE
          </Button>
        </div>

        {method === "cie" ? (
          <>
            <FormInputField
              control={form.control}
              name="username"
              label="Email dell'app CIE ID"
              placeholder="La tua email registrata su CIE ID"
              disabled={mutation.isPending}
            />

            <FormPasswordField
              control={form.control}
              name="password"
              label="Password CIE ID"
              autoComplete="off"
              disabled={mutation.isPending}
            />
          </>
        ) : (
          <>
            {/* codiceFiscale: auto-uppercase transform */}
            <FormField
              control={form.control}
              name="codiceFiscale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Codice fiscale</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={16}
                      spellCheck={false}
                      autoComplete="off"
                      disabled={mutation.isPending}
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormPasswordField
              control={form.control}
              name="password"
              label="Password Fisconline"
              autoComplete="off"
              disabled={mutation.isPending}
            />

            <FormPasswordField
              control={form.control}
              name="pin"
              label="PIN Fisconline"
              autoComplete="off"
              disabled={mutation.isPending}
            />
          </>
        )}
      </EditSettingsDialog>
    </Form>
  );
}
