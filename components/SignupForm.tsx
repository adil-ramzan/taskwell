"use client";

import { useState } from "react";

interface SignupFormProps {
  cta: string;
}

export default function SignupForm({ cta }: SignupFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [successMessage, setSuccessMessage] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status === "submitting" || status === "success") {
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter your email address.");
      setStatus("error");
      return;
    }

    if (!emailRegex.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      setStatus("error");
      return;
    }

    setError("");
    setStatus("submitting");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: unknown; message?: unknown }
        | null;

      if (!response.ok || payload?.success !== true) {
        setError(
          typeof payload?.message === "string"
            ? payload.message
            : "Signup is temporarily unavailable. Please try again later.",
        );
        setStatus("error");
        return;
      }

      setSuccessMessage(
        typeof payload.message === "string"
          ? payload.message
          : "You're on the list.",
      );
      setStatus("success");
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p
        role="status"
        className="rounded-lg bg-brand/10 px-4 py-3 font-medium text-brand-dark dark:bg-brand/20 dark:text-blue-300"
      >
        {successMessage}
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={status === "submitting"}
      className="flex w-full max-w-xl flex-col gap-3 sm:flex-row"
    >
      <div className="min-w-0 flex-1">
        <label htmlFor="signup-email" className="sr-only">
          Email address
        </label>

        <input
          id="signup-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);

            if (error) {
              setError("");
              setStatus("idle");
            }
          }}
          placeholder="Work email"
          autoComplete="email"
          aria-invalid={status === "error" ? "true" : "false"}
          aria-describedby={error ? "signup-email-error" : undefined}
          className="w-full rounded-lg border border-ink/20 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-muted/80 focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50 dark:placeholder:text-dark-muted"
        />

        {error && (
          <p
            id="signup-email-error"
            role="alert"
            className="mt-2 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-lg bg-brand px-5 py-3 font-semibold text-white transition-colors hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-70 dark:focus:ring-offset-dark-background"
      >
        {status === "submitting" ? "Joining..." : cta}
      </button>
    </form>
  );
}
