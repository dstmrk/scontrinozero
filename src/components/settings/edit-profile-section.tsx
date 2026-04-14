"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormInputField } from "@/components/ui/form";
import { updateProfile } from "@/server/profile-actions";

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
  firstName: string | null;
  lastName: string | null;
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

  function handleSubmit(data: EditProfileData) {
    mutation.mutate(data);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        aria-label="Modifica profilo"
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="overscroll-contain">
          <DialogHeader>
            <DialogTitle>Modifica profilo</DialogTitle>
            <DialogDescription>
              Aggiorna il tuo nome e cognome.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              noValidate
              className="space-y-4"
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

              {form.formState.errors.root && (
                <p className="text-destructive text-sm" role="alert">
                  {form.formState.errors.root.message}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  disabled={mutation.isPending}
                >
                  Annulla
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Salvataggio…" : "Salva"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
