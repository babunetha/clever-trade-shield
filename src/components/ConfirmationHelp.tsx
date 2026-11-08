import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MailCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getConfirmationGuidance } from "@/lib/confirmation-guidance.functions";
import { confirmationInput } from "@/lib/confirmation-guidance";

const statuses = [
  ["not_confirmed", "Email not confirmed"],
  ["email_missing", "Confirmation email not received"],
  ["link_expired", "Confirmation link expired"],
  ["confirmed", "Confirmed, but sign-in shows an error"],
  ["unknown", "Not sure"],
] as const;

export function ConfirmationHelp() {
  const ask = useServerFn(getConfirmationGuidance);
  const [status, setStatus] = useState<(typeof statuses)[number][0]>("not_confirmed");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [canResume, setCanResume] = useState(false);

  const submit = async (resume = false) => {
    const parsed = confirmationInput.safeParse({ status, errorMessage, resume });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your input.");
      return;
    }
    setBusy(true);
    setError("");
    setGuidance("");
    try {
      const result = await ask({ data: parsed.data });
      setGuidance(result.guidance ?? "");
      setError(result.error ?? "");
      setPaused(result.paused);
      setCanResume(result.canResume);
    } catch {
      setError("Could not get guidance. Your account and verification have not changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel mt-3 p-4" aria-labelledby="confirmation-help-title">
      <h2 id="confirmation-help-title" className="flex items-center gap-2 text-sm font-semibold">
        <MailCheck className="size-4 text-primary" /> Email confirmation help
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        AI guidance only. Your reported status does not verify your email or change access. No
        passwords, codes, tokens or confirmation links.
      </p>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="confirmation-status">Reported confirmation status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              const option = statuses.find(([key]) => key === value);
              if (option) setStatus(option[0]);
            }}
            disabled={busy}
          >
            <SelectTrigger id="confirmation-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmation-error">Error message (optional)</Label>
          <Textarea
            id="confirmation-error"
            value={errorMessage}
            onChange={(event) => setErrorMessage(event.target.value)}
            maxLength={1200}
            disabled={busy}
            placeholder="For example: Email not confirmed"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Your status and sanitized error are sent to Lovable AI. Guidance uses workspace credits;
          nothing is saved to your journal.
        </p>
        <Button
          disabled={busy || (paused && !canResume)}
          onClick={() => void submit(paused && canResume)}
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <MailCheck className="size-4" />
          )}
          {busy
            ? "Getting safe next steps…"
            : paused && canResume
              ? "Issue resolved — request guidance"
              : "Explain safe next steps"}
        </Button>
        {error ? (
          <p role="alert" className="break-words text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {guidance ? (
          <div
            role="status"
            className="whitespace-pre-wrap break-words border-t border-border pt-4 text-sm leading-relaxed"
          >
            {guidance}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Email delivery and confirmation are not performed by this helper. An unconfirmed owner
          must still confirm through the sign-in page.
        </p>
      </div>
    </section>
  );
}
