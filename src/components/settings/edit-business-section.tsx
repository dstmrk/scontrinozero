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
import { updateBusiness } from "@/server/profile-actions";

const editBusinessSchema = z.object({
  businessName: z
    .string()
    .max(120, "La ragione sociale non può superare 120 caratteri.")
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .min(1, "L'indirizzo è obbligatorio.")
    .max(150, "L'indirizzo non può superare 150 caratteri."),
  streetNumber: z.string().optional().or(z.literal("")),
  city: z
    .string()
    .max(80, "Il comune non può superare 80 caratteri.")
    .optional()
    .or(z.literal("")),
  province: z
    .string()
    .max(3, "La provincia non può superare 3 caratteri.")
    .optional()
    .or(z.literal("")),
  zipCode: z.string().regex(/^\d{5}$/, "CAP non valido (5 cifre numeriche)."),
});

type EditBusinessData = z.infer<typeof editBusinessSchema>;

interface EditBusinessSectionProps {
  businessId: string;
  businessName: string | null;
  address: string | null;
  streetNumber: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
}

export function EditBusinessSection({
  businessId,
  businessName,
  address,
  streetNumber,
  city,
  province,
  zipCode,
}: EditBusinessSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const defaultValues = {
    businessName: businessName ?? "",
    address: address ?? "",
    streetNumber: streetNumber ?? "",
    city: city ?? "",
    province: province ?? "",
    zipCode: zipCode ?? "",
  };

  const form = useForm<EditBusinessData>({
    resolver: zodResolver(editBusinessSchema),
    defaultValues,
  });

  const mutation = useMutation({
    mutationFn: (data: EditBusinessData) => {
      const fd = new FormData();
      fd.set("businessId", businessId);
      fd.set("businessName", data.businessName ?? "");
      fd.set("address", data.address);
      fd.set("streetNumber", data.streetNumber ?? "");
      fd.set("city", data.city ?? "");
      fd.set("province", data.province ?? "");
      fd.set("zipCode", data.zipCode);
      return updateBusiness(fd);
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
      businessName: businessName ?? "",
      address: address ?? "",
      streetNumber: streetNumber ?? "",
      city: city ?? "",
      province: province ?? "",
      zipCode: zipCode ?? "",
    });
    setIsOpen(true);
  }

  function handleSubmit(data: EditBusinessData) {
    mutation.mutate(data);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        aria-label="Modifica attività"
      >
        <Pencil className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="overscroll-contain">
          <DialogHeader>
            <DialogTitle>Modifica attività</DialogTitle>
            <DialogDescription>
              Aggiorna i dati della tua attività. P.IVA e Codice Fiscale sono
              gestiti dall&apos;Agenzia delle Entrate e non modificabili qui.
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
                name="businessName"
                label="Ragione sociale"
                autoComplete="organization"
                disabled={mutation.isPending}
              />

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <FormInputField
                    control={form.control}
                    name="address"
                    label="Indirizzo"
                    autoComplete="street-address"
                    disabled={mutation.isPending}
                  />
                </div>
                <FormInputField
                  control={form.control}
                  name="streetNumber"
                  label="Civico"
                  autoComplete="off"
                  disabled={mutation.isPending}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <FormInputField
                    control={form.control}
                    name="city"
                    label="Comune"
                    autoComplete="address-level2"
                    disabled={mutation.isPending}
                  />
                </div>
                <FormInputField
                  control={form.control}
                  name="province"
                  label="Prov."
                  autoComplete="address-level1"
                  disabled={mutation.isPending}
                />
              </div>

              <FormInputField
                control={form.control}
                name="zipCode"
                label="CAP"
                autoComplete="postal-code"
                inputMode="numeric"
                maxLength={5}
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
