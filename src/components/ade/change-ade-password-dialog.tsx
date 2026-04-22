"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { changeAdePassword } from "@/server/onboarding-actions";

// Lettere non accentate, numeri, caratteri speciali ammessi da Fisconline
const ADE_PASSWORD_REGEX = /^[a-zA-Z0-9*+§°ç@^?=)(/&%$£!|\\<>]{8,15}$/;

const schema = z
  .object({
    currentPassword: z.string().min(1, "Inserisci la password attuale."),
    newPassword: z
      .string()
      .regex(
        ADE_PASSWORD_REGEX,
        String.raw`8–15 caratteri: lettere (non accentate), numeri o * + § ° ç @ ^ ? = ) ( / & % $ £ ! | \ < >`,
      ),
    confirmNewPassword: z.string().min(1, "Conferma la nuova password."),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: "Le password non coincidono.",
    path: ["confirmNewPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "La nuova password deve essere diversa da quella attuale.",
    path: ["newPassword"],
  });

type FormData = z.infer<typeof schema>;

interface ChangeAdePasswordDialogProps {
  readonly businessId: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSuccess?: () => void;
}

export function ChangeAdePasswordDialog({
  businessId,
  open,
  onClose,
  onSuccess,
}: ChangeAdePasswordDialogProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      changeAdePassword(
        businessId,
        data.currentPassword,
        data.newPassword,
        data.confirmNewPassword,
      ),
    onSuccess: (result) => {
      if (result.error) {
        form.setError("root", { message: result.error });
      } else {
        form.reset();
        onSuccess?.();
      }
    },
    onError: () => {
      form.setError("root", {
        message: "Si è verificato un errore. Riprova più tardi.",
      });
    },
  });

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      form.reset();
      mutation.reset();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overscroll-contain">
        <DialogHeader>
          <DialogTitle>Aggiorna password Fisconline</DialogTitle>
          <DialogDescription>
            {"Inserisci la password Fisconline attuale e scegline una nuova."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            noValidate
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{"Password attuale"}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="current-password"
                      disabled={mutation.isPending}
                      aria-invalid={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{"Nuova password"}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      disabled={mutation.isPending}
                      aria-invalid={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmNewPassword"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{"Conferma nuova password"}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="new-password"
                      disabled={mutation.isPending}
                      aria-invalid={!!fieldState.error}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.formState.errors.root && (
              <p role="alert" className="text-destructive text-sm">
                {form.formState.errors.root.message}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={mutation.isPending}
              >
                {"Annulla"}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? "Aggiornamento in corso…"
                  : "Aggiorna password"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
