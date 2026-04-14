"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Form, FormInputField } from "@/components/ui/form";
import { updateProfile } from "@/server/profile-actions";
import { EditSettingsDialog } from "./edit-settings-dialog";

const editProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, "Il nome è obbligatorio.")
    .max(80, "Il nome non può superare 80 caratteri."),
  lastName: z
    .string()
    .min(1, "Il cognome è obbligatorio.")
    .max(80, "Il cognome non può superare 80 caratteri."),
});

type EditProfileData = z.infer<typeof editProfileSchema>;

interface EditProfileSectionProps {
  readonly firstName: string | null;
  readonly lastName: string | null;
}

export function EditProfileSection({
  firstName,
  lastName,
}: EditProfileSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const form = useForm<EditProfileData>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      firstName: firstName ?? "",
      lastName: lastName ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: EditProfileData) => {
      const fd = new FormData();
      fd.set("firstName", data.firstName);
      fd.set("lastName", data.lastName);
      return updateProfile(fd);
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
    form.reset({ firstName: firstName ?? "", lastName: lastName ?? "" });
    setIsOpen(true);
  }

  return (
    <Form {...form}>
      <EditSettingsDialog
        ariaLabel="Modifica profilo"
        title="Modifica profilo"
        description="Aggiorna il tuo nome e cognome."
        isOpen={isOpen}
        isPending={mutation.isPending}
        rootError={form.formState.errors.root?.message}
        onOpen={handleOpen}
        onClose={() => setIsOpen(false)}
        onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
      >
        <FormInputField
          control={form.control}
          name="firstName"
          label="Nome"
          autoComplete="given-name"
          disabled={mutation.isPending}
        />

        <FormInputField
          control={form.control}
          name="lastName"
          label="Cognome"
          autoComplete="family-name"
          disabled={mutation.isPending}
        />
      </EditSettingsDialog>
    </Form>
  );
}
