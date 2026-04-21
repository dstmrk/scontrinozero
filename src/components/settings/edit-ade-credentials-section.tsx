"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { adePinSchema } from "@/lib/validation";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormPasswordField,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { saveAdeCredentials } from "@/server/onboarding-actions";
import { EditSettingsDialog } from "./edit-settings-dialog";

const editAdeCredentialsSchema = z.object({
  codiceFiscale: z
    .string()
    .min(16, "Codice fiscale non valido (16 caratteri).")
    .max(16, "Codice fiscale non valido (16 caratteri)."),
  password: z.string().min(1, "La password Fisconline è obbligatoria."),
  pin: adePinSchema,
});

type EditAdeCredentialsData = z.infer<typeof editAdeCredentialsSchema>;

interface EditAdeCredentialsSectionProps {
  readonly businessId: string;
}

export function EditAdeCredentialsSection({
  businessId,
}: EditAdeCredentialsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const form = useForm<EditAdeCredentialsData>({
    resolver: zodResolver(editAdeCredentialsSchema),
    defaultValues: { codiceFiscale: "", password: "", pin: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: EditAdeCredentialsData) => {
      const fd = new FormData();
      fd.set("businessId", businessId);
      fd.set("codiceFiscale", data.codiceFiscale);
      fd.set("password", data.password);
      fd.set("pin", data.pin);
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
    form.reset();
    setIsOpen(true);
  }

  return (
    <Form {...form}>
      <EditSettingsDialog
        ariaLabel="Modifica credenziali AdE"
        title="Modifica credenziali Fisconline"
        description="Inserisci le nuove credenziali. Dopo il salvataggio dovrai riverificare la connessione con l'AdE."
        isOpen={isOpen}
        isPending={mutation.isPending}
        rootError={form.formState.errors.root?.message}
        onOpen={handleOpen}
        onClose={() => setIsOpen(false)}
        onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
      >
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
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
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
      </EditSettingsDialog>
    </Form>
  );
}
