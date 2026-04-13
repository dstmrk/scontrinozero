"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Form, FormInputField } from "@/components/ui/form";
import { deleteAccount } from "@/server/account-actions";

const CONFIRM_WORD = "ELIMINA";

const deleteSchema = z
  .object({ confirmText: z.string() })
  .superRefine((data, ctx) => {
    if (data.confirmText !== CONFIRM_WORD) {
      ctx.addIssue({
        code: "custom",
        message: `Scrivi ${CONFIRM_WORD} per confermare.`,
        path: ["confirmText"],
      });
    }
  });

type DeleteData = z.infer<typeof deleteSchema>;

export function AccountDeleteSection() {
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<DeleteData>({
    resolver: zodResolver(deleteSchema),
    defaultValues: { confirmText: "" },
  });

  const confirmTextValue = useWatch({
    control: form.control,
    name: "confirmText",
  });

  const mutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: (result) => {
      if (result.error) {
        form.setError("root", { message: result.error });
      }
    },
    onError: (err) => {
      // NEXT_REDIRECT is thrown when redirect() is called server-side — navigation
      // is already in progress, no error to surface.
      const digest = (err as { digest?: string }).digest ?? "";
      if (digest.startsWith("NEXT_REDIRECT")) return;
      form.setError("root", {
        message: "Si è verificato un errore. Riprova più tardi.",
      });
    },
  });

  function handleOpen() {
    form.reset();
    setIsOpen(true);
  }

  function handleSubmit() {
    mutation.mutate();
  }

  return (
    <>
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-4">
        <h3 className="text-destructive mb-1 font-medium">Zona pericolosa</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Elimina definitivamente il tuo account e tutti i dati associati
          (attività, credenziali, scontrini). Questa operazione è irreversibile.
        </p>
        <Button variant="destructive" onClick={handleOpen}>
          Elimina account
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="overscroll-contain">
          <DialogHeader>
            <DialogTitle>Eliminare l&apos;account?</DialogTitle>
            <DialogDescription>
              Questa operazione è <strong>permanente e irreversibile</strong>.
              Verranno eliminati:
            </DialogDescription>
          </DialogHeader>

          <ul className="text-muted-foreground ml-4 list-disc space-y-1 text-sm">
            <li>Il tuo profilo e i dati dell&apos;attività</li>
            <li>Le credenziali Fisconline salvate</li>
            <li>Tutti gli scontrini emessi e il catalogo prodotti</li>
          </ul>

          <p className="text-muted-foreground mt-2 text-sm">
            I documenti commerciali già trasmessi all&apos;Agenzia delle Entrate
            restano disponibili sul portale{" "}
            <strong>Fatture e Corrispettivi</strong> anche dopo la cancellazione
            dell&apos;account. Puoi consultarli in qualsiasi momento accedendo
            con le tue credenziali Fisconline.
          </p>

          <p className="mt-2 text-sm">
            Scrivi <strong>{CONFIRM_WORD}</strong> per confermare:
          </p>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              noValidate
              className="space-y-3"
            >
              <FormInputField
                control={form.control}
                name="confirmText"
                placeholder={CONFIRM_WORD}
                autoComplete="off"
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
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    confirmTextValue !== CONFIRM_WORD || mutation.isPending
                  }
                >
                  {mutation.isPending
                    ? "Eliminazione…"
                    : "Elimina definitivamente"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
