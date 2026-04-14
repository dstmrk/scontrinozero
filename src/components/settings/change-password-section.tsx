"use client";

import { useState } from "react";
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
  FormPasswordField,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { changePassword } from "@/server/profile-actions";
import { passwordFieldSchema } from "@/lib/validation";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Inserisci la password attuale."),
    newPassword: passwordFieldSchema,
    confirmPassword: z.string().min(1, "Conferma la nuova password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Le password non coincidono.",
    path: ["confirmPassword"],
  });

type ChangePasswordData = z.infer<typeof changePasswordSchema>;

export function ChangePasswordSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  const form = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ChangePasswordData) => {
      const fd = new FormData();
      fd.set("currentPassword", data.currentPassword);
      fd.set("newPassword", data.newPassword);
      fd.set("confirmPassword", data.confirmPassword);
      return changePassword(fd);
    },
    onSuccess: (result) => {
      if (result.error) {
        form.setError("root", { message: result.error });
      } else {
        setSuccessMessage(true);
        form.reset();
        setTimeout(() => {
          setIsOpen(false);
          setSuccessMessage(false);
        }, 1500);
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
    setSuccessMessage(false);
    setIsOpen(true);
  }

  function handleSubmit(data: ChangePasswordData) {
    mutation.mutate(data);
  }

  return (
    <>
      <p className="text-muted-foreground mb-4 text-sm">
        Cambia la password di accesso al tuo account.
      </p>
      <Button variant="outline" onClick={handleOpen}>
        Cambia password
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="overscroll-contain">
          <DialogHeader>
            <DialogTitle>Cambia password</DialogTitle>
            <DialogDescription>
              Inserisci la password attuale e scegline una nuova.
            </DialogDescription>
          </DialogHeader>

          {successMessage ? (
            <p className="py-4 text-center text-sm text-green-600">
              Password aggiornata con successo.
            </p>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                noValidate
                className="space-y-4"
              >
                <FormPasswordField
                  control={form.control}
                  name="currentPassword"
                  label="Password attuale"
                  autoComplete="current-password"
                  disabled={mutation.isPending}
                />

                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Nuova password</FormLabel>
                      <FormControl>
                        <PasswordInput
                          autoComplete="new-password"
                          disabled={mutation.isPending}
                          {...field}
                        />
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
                  label="Conferma nuova password"
                  autoComplete="new-password"
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
                    {mutation.isPending ? "Salvataggio…" : "Salva password"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
