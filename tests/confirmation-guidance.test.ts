import { describe, expect, test } from "bun:test";
import { confirmationInput, mayResumeGuidance, sanitizeConfirmationError } from "../src/lib/confirmation-guidance";

describe("confirmation guidance boundaries", () => {
  test("rejects invented confirmation statuses", () => {
    expect(confirmationInput.safeParse({ status: "auto_confirm", errorMessage: "" }).success).toBe(false);
  });
  test("rejects verification mutation fields", () => {
    expect(confirmationInput.safeParse({ status: "confirmed", errorMessage: "", email_confirmed_at: "now" }).success).toBe(false);
  });
  test("rejects credential-bearing errors", () => {
    expect(confirmationInput.safeParse({ status: "unknown", errorMessage: "password=private-value" }).success).toBe(false);
    expect(confirmationInput.safeParse({ status: "unknown", errorMessage: "access_token=private-value" }).success).toBe(false);
  });
  test("removes personal email and confirmation links before AI", () => {
    expect(sanitizeConfirmationError("Email test@example.com https://example.com/confirm?token=secret expired")).toBe("Email [email removed] [link removed] expired");
  });
  test("bounds network input", () => {
    expect(confirmationInput.safeParse({ status: "unknown", errorMessage: "a".repeat(1201) }).success).toBe(false);
  });
  test("provider denials cannot be resumed by a client flag", () => {
    expect(mayResumeGuidance({ provider_denial: true }, true)).toBe(false);
  });
  test("workspace pauses require an explicit owner request", () => {
    expect(mayResumeGuidance({ provider_denial: false }, false)).toBe(false);
    expect(mayResumeGuidance({ provider_denial: false }, true)).toBe(true);
  });
});