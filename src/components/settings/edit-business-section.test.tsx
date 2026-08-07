import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditBusinessSection } from "./edit-business-section";
import { ITALIAN_PROVINCE_MESSAGE } from "@/lib/validation";

const mockUpdateBusiness = vi.fn();
vi.mock("@/server/profile-actions", () => ({
  updateBusiness: (fd: FormData) => mockUpdateBusiness(fd),
}));

const mockRouterRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateBusiness.mockResolvedValue({});
});

function renderSection(province: string | null = "NA") {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EditBusinessSection
        businessId="biz-1"
        businessName="Bar Centrale"
        address="Via Roma"
        streetNumber="1"
        city="Napoli"
        province={province}
        zipCode="80100"
        preferredVatCode="22"
      />
    </QueryClientProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Modifica attività" }));
}

function setProvince(value: string) {
  fireEvent.change(screen.getByLabelText("Prov."), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Salva" }));
}

describe("EditBusinessSection", () => {
  it("precompila la provincia dai dati dell'attività", () => {
    renderSection();
    openDialog();

    expect(screen.getByLabelText("Prov.")).toHaveValue("NA");
  });

  // Il guard client esiste per NON far scoprire l'errore all'utente dopo
  // l'emissione: senza, l'AdE rigetta lo scontrino con
  // `EF0 — 'Provincia' non valido` e la vendita non viene registrata.
  it("blocca il submit quando la provincia non è una sigla di 2 lettere", async () => {
    renderSection();
    openDialog();
    setProvince("ROMA");
    submit();

    expect(await screen.findByText(ITALIAN_PROVINCE_MESSAGE)).toBeVisible();
    expect(mockUpdateBusiness).not.toHaveBeenCalled();
  });

  it("blocca il submit su una sigla di una sola lettera", async () => {
    renderSection();
    openDialog();
    setProvince("N");
    submit();

    expect(await screen.findByText(ITALIAN_PROVINCE_MESSAGE)).toBeVisible();
    expect(mockUpdateBusiness).not.toHaveBeenCalled();
  });

  // Il maiuscolo lo impone il server (`normalizeProvince`): il client accetta
  // il minuscolo senza infastidire l'utente con un errore evitabile.
  it("accetta una sigla minuscola e la invia alla server action", async () => {
    renderSection();
    openDialog();
    setProvince("na");
    submit();

    await waitFor(() => expect(mockUpdateBusiness).toHaveBeenCalled());
    const fd = mockUpdateBusiness.mock.calls[0][0] as FormData;
    expect(fd.get("province")).toBe("na");
  });

  it("accetta la provincia vuota (campo opzionale)", async () => {
    renderSection(null);
    openDialog();
    setProvince("");
    submit();

    await waitFor(() => expect(mockUpdateBusiness).toHaveBeenCalled());
    const fd = mockUpdateBusiness.mock.calls[0][0] as FormData;
    expect(fd.get("province")).toBe("");
  });

  it("limita il campo a 2 caratteri", () => {
    renderSection();
    openDialog();

    expect(screen.getByLabelText("Prov.")).toHaveAttribute("maxLength", "2");
  });
});
