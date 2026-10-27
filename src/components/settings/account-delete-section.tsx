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
import { useIsCollaborator } from "@/components/dashboard/member-role";
import { deleteAccount } from "@/server/account-actions";

const deleteSchema = z.object({
  password: z.string().min(1, "Inserisci la tua password."),
});

type DeleteData = z.infer<typeof deleteSchema>;

/** Cosa sparisce con l'account del titolare: l'attività e chi ci lavora. */
function OwnerDeletionNotes() {
  return (
    <>
      <DialogDescription>
        Questa operazione è <strong>permanente e irreversibile</strong>.
        Verranno eliminati:
      </DialogDescription>

      <ul className="text-muted-foreground ml-4 list-disc space-y-1 text-sm">
        <li>Il tuo profilo e i dati dell&apos;attività</li>
        <li>Le credenziali di accesso AdE salvate (Fisconline o CIE ID)</li>
        <li>Tutti gli scontrini emessi e il catalogo prodotti</li>
        <li>
          Gli account dei tuoi collaboratori, se ne hai: riceveranno
          un&apos;email
        </li>
      </ul>

      <p className="text-muted-foreground mt-2 text-sm">
        Se hai un <strong>abbonamento attivo</strong>, verrà annullato
        immediatamente: non ti verrà addebitato alcun rinnovo.
      </p>

      <p className="text-muted-foreground mt-2 text-sm">
        I documenti commerciali già trasmessi all&apos;Agenzia delle Entrate
        restano disponibili sul portale <strong>Fatture e Corrispettivi</strong>{" "}
        anche dopo la cancellazione dell&apos;account. Puoi consultarli in
        qualsiasi momento accedendo con le tue credenziali AdE (Fisconline o CIE
        ID).
      </p>
    </>
  );
}

/**
 * Il collaboratore che elimina l'account esce dall'attività (issue #1099):
 * i documenti che ha emesso restano al titolare.
 */
function CollaboratorDeletionNotes() {
  return (
    <DialogDescription>
      Questa operazione è <strong>permanente e irreversibile</strong>: il tuo
      account e la tua email vengono eliminati e non potrai più accedere. I
      documenti che hai emesso restano all&apos;attività, attribuiti al tuo
      nome.
    </DialogDescription>
  );
}

export function AccountDeleteSection() {
  const isCollaborator = useIsCollaborator();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<DeleteData>({
    resolver: zodResolver(deleteSchema),
    defaultValues: { password: "" },
  });

  const passwordValue = useWatch({
    control: form.control,
    name: "password",
  });

  const mutation = useMutation({
    mutationFn: (data: DeleteData) => {
      const formData = new FormData();
      formData.set("currentPassword", data.password);
      return deleteAccount(formData);
    },
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

  function handleSubmit(data: DeleteData) {
    mutation.mutate(data);
  }

  return (
    <>
      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-4">
        <h3 className="text-destructive mb-1 font-medium">Zona pericolosa</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          {isCollaborator
            ? "Elimina il tuo account ed esci dall'attività. I documenti che hai emesso restano all'attività. Questa operazione è irreversibile."
            : "Elimina definitivamente il tuo account e tutti i dati associati (attività, credenziali, scontrini, collaboratori). Questa operazione è irreversibile."}
        </p>
        <Button variant="destructive" onClick={handleOpen}>
          Elimina account
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="overscroll-contain">
          <DialogHeader>
            <DialogTitle>Eliminare l&apos;account?</DialogTitle>
          </DialogHeader>

          {isCollaborator ? (
            <CollaboratorDeletionNotes />
          ) : (
            <OwnerDeletionNotes />
          )}

          <p className="mt-2 text-sm">
            Inserisci la tua <strong>password</strong> per confermare:
          </p>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              noValidate
              className="space-y-3"
            >
              <FormInputField
                control={form.control}
                name="password"
                type="password"
                placeholder="La tua password"
                autoComplete="current-password"
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
                  disabled={!passwordValue || mutation.isPending}
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
