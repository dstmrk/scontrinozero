import { describe, expect, it } from "vitest";
import {
  ERROR_MESSAGES,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "./error-messages";

describe("ERROR_MESSAGES", () => {
  it("definisce tutti i messaggi base", () => {
    expect(ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES).toBe(
      "Troppi tentativi. Riprova tra qualche minuto.",
    );
    expect(ERROR_MESSAGES.RATE_LIMIT_API_HOURS).toBe(
      "Troppe richieste. Riprova tra qualche ora.",
    );
    expect(ERROR_MESSAGES.PASSWORDS_MISMATCH).toBe(
      "Le password non coincidono.",
    );
    expect(ERROR_MESSAGES.UNAUTHORIZED).toBe("Non autorizzato.");
  });

  it("incorpora i requisiti password nei due preamboli", () => {
    expect(ERROR_MESSAGES.PASSWORD_NOT_STRONG).toContain(
      PASSWORD_REQUIREMENTS_MESSAGE,
    );
    expect(ERROR_MESSAGES.NEW_PASSWORD_NOT_STRONG).toContain(
      PASSWORD_REQUIREMENTS_MESSAGE,
    );
    expect(
      ERROR_MESSAGES.PASSWORD_NOT_STRONG.startsWith("Password non sicura"),
    ).toBe(true);
    expect(
      ERROR_MESSAGES.NEW_PASSWORD_NOT_STRONG.startsWith(
        "La nuova password non è sicura",
      ),
    ).toBe(true);
  });
});
