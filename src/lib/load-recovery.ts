export const RECOVERY_TIMEOUT_MS = 12_000;
export const SIGN_IN_TIMEOUT_MS = 5_000;

export async function boundedLoad<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Loading timed out. Please retry.")), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type SignInStatus = "checking" | "signed-in" | "signed-out" | "unavailable";
export const signInLabels: Record<SignInStatus, string> = {
  checking: "Checking sign-in…",
  "signed-in": "Signed in · access will be checked on retry",
  "signed-out": "Not signed in",
  unavailable: "Unable to verify sign-in · your session has not been cleared",
};