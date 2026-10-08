"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

// Only same-origin paths are allowed, so callbackUrl can't be used as an open redirect.
function getSafeCallbackUrl(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/dashboard";
  }

  return value;
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const success = searchParams.get("success");
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const callbackUrl = getSafeCallbackUrl(rawCallbackUrl);
  const callbackQuery = rawCallbackUrl
    ? `&callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "";
  const [loading, setLoading] = useState(false);
  // Second step for accounts with two-factor sign-in: the email and password are
  // kept in memory only (never in the URL) and sent again with the code.
  const [pending, setPending] = useState<{ email: string; password: string } | null>(null);
  const [codeError, setCodeError] = useState("");

  async function attempt(email: string, password: string, code?: string) {
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      ...(code ? { code } : {}),
      redirect: false,
    });

    setLoading(false);

    if (result?.error === "TwoFactorRequired") {
      setPending({ email, password });
      setCodeError("");
      return;
    }

    if (result?.error === "TwoFactorInvalid") {
      setCodeError("That code isn't valid. Use the newest code from your app, or a recovery code.");
      return;
    }

    if (result?.error === "TwoFactorThrottled") {
      setCodeError("Too many incorrect codes. Wait 15 minutes, then try again.");
      return;
    }

    setPending(null);

    if (result?.status === 429 || result?.error === "TooManyAttempts") {
      router.push(`/login?error=too-many-attempts${callbackQuery}`);
      return;
    }

    // auth.ts throws this when the database can't be reached: not a wrong password.
    if (result?.error === "Authentication is temporarily unavailable.") {
      router.push(`/login?error=unavailable${callbackQuery}`);
      return;
    }

    if (result?.error) {
      router.push(`/login?error=invalid-credentials${callbackQuery}`);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      router.push(`/login?error=missing-fields${callbackQuery}`);
      return;
    }

    await attempt(email, password);
  }

  async function handleCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();

    if (!pending || !code) {
      setCodeError("Enter the code from your authenticator app, or a recovery code.");
      return;
    }

    await attempt(pending.email, pending.password, code);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-5 py-20">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand">
          Welcome back
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink">Log in</h1>

        {error === "missing-fields" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Please enter both email and password.
          </p>
        )}

        {error === "too-many-attempts" && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Too many failed sign-in attempts. Wait 15 minutes, then try again.
          </p>
        )}

        {error === "unavailable" && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            We can&apos;t sign you in right now because Taskwell is temporarily unavailable. Please try again in a moment.
          </p>
        )}

        {error === "invalid-credentials" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Invalid email or password.
          </p>
        )}

        {success === "password-changed" && (
          <p className="mt-4 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-brand-dark">
            Your password was changed and you were signed out on every device. Log in with your new password.
          </p>
        )}

        {success === "account-deleted" && (
          <p className="mt-4 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-brand-dark">
            Your account was deleted and you were signed out everywhere.
          </p>
        )}

        {success === "account-created" && (
          <p className="mt-4 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-brand-dark">
            Your account is ready. Log in to continue.
          </p>
        )}

        {pending ? (
          <form onSubmit={handleCode} noValidate className="mt-8 space-y-5">
            <div>
              <label htmlFor="login-code" className="mb-2 block text-sm font-medium text-ink">
                Two-factor code
              </label>
              <p id="login-code-hint" className="mb-2 text-sm text-muted">
                Enter the 6-digit code from your authenticator app, or one of your recovery codes.
              </p>
              <input
                id="login-code"
                name="code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                aria-describedby={`login-code-hint${codeError ? " login-code-error" : ""}`}
                aria-invalid={codeError ? true : undefined}
                className="w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {codeError && (
              <p id="login-code-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {codeError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand px-5 py-3 font-semibold text-white transition-colors hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80"
            >
              {loading ? "Checking..." : "Verify and log in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setCodeError("");
              }}
              className="w-full rounded-lg px-5 py-2 text-sm font-medium text-brand hover:underline focus:outline-none focus:ring-2 focus:ring-brand"
            >
              Use a different account
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-ink">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand px-5 py-3 font-semibold text-white transition-colors hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80"
            >
              {loading ? "Logging in..." : "Log in"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          Need an account? {" "}
          <Link
            href={rawCallbackUrl ? `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/signup"}
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-120px)]" />}>
      <LoginFormContent />
    </Suspense>
  );
}
