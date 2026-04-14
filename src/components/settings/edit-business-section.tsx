"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Form, FormInputField } from "@/components/ui/form";
import { updateBusiness } from "@/server/profile-actions";
import { EditSettingsDialog } from "./edit-settings-dialog";

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
  readonly businessId: string;
  readonly businessName: string | null;
  readonly address: string | null;
  readonly streetNumber: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly zipCode: string | null;
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

  return (
    <Form {...form}>
      <EditSettingsDialog
        ariaLabel="Modifica attività"
        title="Modifica attività"
        description={
          <>
            Aggiorna i dati della tua attività. P.IVA e Codice Fiscale sono
            gestiti dall&apos;Agenzia delle Entrate e non modificabili qui.
          </>
        }
        isOpen={isOpen}
        isPending={mutation.isPending}
        rootError={form.formState.errors.root?.message}
        onOpen={handleOpen}
        onClose={() => setIsOpen(false)}
        onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
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
      </EditSettingsDialog>
    </Form>
  );
}
