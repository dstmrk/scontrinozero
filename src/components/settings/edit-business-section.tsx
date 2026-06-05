"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Form,
  FormControl,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateBusiness } from "@/server/profile-actions";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { BUSINESS_PROFILE_LIMITS } from "@/lib/validation";
import {
  isValidPreferredVatCode,
  VAT_CODES,
  VAT_DESCRIPTIONS,
  type VatCode,
} from "@/types/cassa";
import { EditSettingsDialog } from "./edit-settings-dialog";

const NO_VAT_PREFERENCE = "__none__";

/**
 * Normalizza il valore proveniente dal DB / props: se non corrisponde a un
 * `VatCode` valido, ricade su `""` (nessuna preferenza). Evita il cast cieco
 * `as VatCode | ""` che silenzia drift della colonna `profiles.preferred_vat_code`.
 */
function normalizePreferredVatCode(value: string | null = ""): VatCode | "" {
  return isValidPreferredVatCode(value) ? value : "";
}

const editBusinessSchema = z.object({
  businessName: z
    .string()
    .max(
      BUSINESS_PROFILE_LIMITS.businessName,
      `La ragione sociale non può superare ${BUSINESS_PROFILE_LIMITS.businessName} caratteri.`,
    )
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .min(1, "L'indirizzo è obbligatorio.")
    .max(
      BUSINESS_PROFILE_LIMITS.address,
      `L'indirizzo non può superare ${BUSINESS_PROFILE_LIMITS.address} caratteri.`,
    ),
  streetNumber: z.string().optional().or(z.literal("")),
  city: z
    .string()
    .max(
      BUSINESS_PROFILE_LIMITS.city,
      `Il comune non può superare ${BUSINESS_PROFILE_LIMITS.city} caratteri.`,
    )
    .optional()
    .or(z.literal("")),
  province: z
    .string()
    .max(
      BUSINESS_PROFILE_LIMITS.province,
      `La provincia non può superare ${BUSINESS_PROFILE_LIMITS.province} caratteri.`,
    )
    .optional()
    .or(z.literal("")),
  zipCode: z.string().regex(/^\d{5}$/, "CAP non valido (5 cifre numeriche)."),
  preferredVatCode: z.enum(VAT_CODES).or(z.literal("")).optional(),
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
  readonly preferredVatCode: string | null;
}

export function EditBusinessSection({
  businessId,
  businessName,
  address,
  streetNumber,
  city,
  province,
  zipCode,
  preferredVatCode,
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
    preferredVatCode: normalizePreferredVatCode(preferredVatCode),
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
      fd.set("preferredVatCode", data.preferredVatCode ?? "");
      return updateBusiness(fd);
    },
    onSuccess: (result) => {
      if (result.error) {
        // Errori previsti/permanenti (validazione, ownership, rate limit): la
        // server action ritorna un messaggio già tarato — mostrarlo verbatim.
        form.setError("root", { message: result.error });
      } else {
        setIsOpen(false);
        router.refresh();
      }
    },
    onError: () => {
      // onError scatta solo su eccezione lanciata (DB/network): per costruzione
      // gli errori d'input permanenti tornano via onSuccess come { error }.
      // Questo ramo è quindi sempre transiente/retry-able: distinguiamo il caso
      // offline (azionabile dall'utente) dall'errore server temporaneo, invece
      // del generico "Riprova più tardi" che non chiariva la retry-abilità.
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      form.setError("root", {
        message: offline
          ? ERROR_MESSAGES.NETWORK_OFFLINE
          : ERROR_MESSAGES.GENERIC_TRANSIENT,
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
      preferredVatCode: normalizePreferredVatCode(preferredVatCode),
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

        <FormField
          control={form.control}
          name="preferredVatCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Aliquota IVA prevalente</FormLabel>
              <Select
                onValueChange={(value) =>
                  field.onChange(value === NO_VAT_PREFERENCE ? "" : value)
                }
                value={field.value === "" ? NO_VAT_PREFERENCE : field.value}
                disabled={mutation.isPending}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Nessuna preferenza" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_VAT_PREFERENCE}>
                    Nessuna preferenza
                  </SelectItem>
                  {VAT_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {VAT_DESCRIPTIONS[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
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
