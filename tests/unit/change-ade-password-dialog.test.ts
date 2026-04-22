// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

// Replica della schema di validazione del dialog (logica client-side)
const ADE_PASSWORD_REGEX = /^[a-zA-Z0-9*+§°ç@^?=)(\/&%$£!|\\<>]{8,15}$/;

const schema = z
  .object({
    currentPassword: z.string().min(1, "Inserisci la password attuale."),
    newPassword: z
      .string()
      .regex(
        ADE_PASSWORD_REGEX,
        "8–15 caratteri: lettere (non accentate), numeri o caratteri speciali",
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

describe("ChangeAdePasswordDialog — validazione client-side", () => {
  it("accetta password valida con lettere e numeri (8 char)", () => {
    const result = schema.safeParse({
      currentPassword: "OldPass1",
      newPassword: "NewPass2",
      confirmNewPassword: "NewPass2",
    });
    expect(result.success).toBe(true);
  });

  it("accetta password valida con caratteri speciali", () => {
    const result = schema.safeParse({
      currentPassword: "OldPass1",
      newPassword: "Pass@12*",
      confirmNewPassword: "Pass@12*",
    });
    expect(result.success).toBe(true);
  });

  it("accetta password di esattamente 15 caratteri", () => {
    const result = schema.safeParse({
      currentPassword: "OldPass1",
      newPassword: "ValidPass123456",
      confirmNewPassword: "ValidPass123456",
    });
    expect(result.success).toBe(true);
  });

  it("rifiuta password troppo corta (< 8 char)", () => {
    const result = schema.safeParse({
      currentPassword: "OldPass1",
      newPassword: "Short1",
      confirmNewPassword: "Short1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("newPassword");
    }
  });

  it("rifiuta password troppo lunga (> 15 char)", () => {
    const result = schema.safeParse({
      currentPassword: "OldPass1",
      newPassword: "ThisIsWayTooLong1",
      confirmNewPassword: "ThisIsWayTooLong1",
    });
    expect(result.success).toBe(false);
  });

  it("rifiuta password con lettere accentate", () => {
    const result = schema.safeParse({
      currentPassword: "OldPass1",
      newPassword: "Pàssword1",
      confirmNewPassword: "Pàssword1",
    });
    expect(result.success).toBe(false);
  });

  it("rifiuta quando nuova password != conferma", () => {
    const result = schema.safeParse({
      currentPassword: "OldPass1",
      newPassword: "NewPass2",
      confirmNewPassword: "NewPass9",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmError = result.error.issues.find(
        (i) => i.path[0] === "confirmNewPassword",
      );
      expect(confirmError?.message).toMatch(/non coincidono/i);
    }
  });

  it("rifiuta quando nuova password == password attuale", () => {
    const result = schema.safeParse({
      currentPassword: "SamePass1",
      newPassword: "SamePass1",
      confirmNewPassword: "SamePass1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const newPwError = result.error.issues.find(
        (i) => i.path[0] === "newPassword",
      );
      expect(newPwError?.message).toMatch(/diversa da quella attuale/i);
    }
  });

  it("rifiuta password vuota attuale", () => {
    const result = schema.safeParse({
      currentPassword: "",
      newPassword: "NewPass2",
      confirmNewPassword: "NewPass2",
    });
    expect(result.success).toBe(false);
  });
});
