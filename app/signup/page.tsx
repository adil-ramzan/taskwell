"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateName } from "@/lib/account-validation";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SignupFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  // Carried through to the login page, so someone who signs up from an invitation
  // link lands back on that invitation. The login page checks it before using it.
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const callbackQuery = rawCallbackUrl ? `&callbackUrl=${encodeURIComponent(rawCallbackUrl)}` : "";
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!name || !email || !password || !confirmPassword) {
      router.push(`/signup?error=missing-fields${callbackQuery}`);
      return;
    }

    if (name.length > NAME_MAX_LENGTH || "error" in validateName(name)) {
      router.push(`/signup?error=name-too-long${callbackQuery}`);
      return;
    }

    if (!emailPattern.test(email)) {
      router.push(`/signup?error=invalid-email${callbackQuery}`);
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      router.push(`/signup?error=weak-password${callbackQuery}`);
      return;
    }

    if (password !== confirmPassword) {
      router.push(`/signup?error=password-mismatch${callbackQuery}`);
      return;
    }

    setLoading(true);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, email, password }),
    });

    setLoading(false);

    if (!response.ok) {
      const payload = await response.json().catch(() => null);

      if (typeof payload?.error === "string" && payload.error.startsWith("Name must be")) {
        router.push(`/signup?error=name-too-long${callbackQuery}`);
        return;
      }

      if (payload?.error?.includes("already exists")) {
        router.push(`/signup?error=account-exists${callbackQuery}`);
        return;
      }

      router.push(`/signup?error=unknown${callbackQuery}`);
      return;
    }

    router.push(`/login?success=account-created${callbackQuery}`);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center justify-center px-5 py-20">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand">
          Start working smarter
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink">Create account</h1>

        {error === "missing-fields" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Please fill in all required fields.
          </p>
        )}

        {error === "name-too-long" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Name must be {NAME_MAX_LENGTH} characters or fewer.
          </p>
        )}

        {error === "invalid-email" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Enter a valid email address.
          </p>
        )}

        {error === "weak-password" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Password must be at least {PASSWORD_MIN_LENGTH} characters long.
          </p>
        )}

        {error === "password-mismatch" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Passwords do not match.
          </p>
        )}

        {error === "account-exists" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            An account with that email already exists.
          </p>
        )}

        {error === "unknown" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            We could not create your account right now.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="signup-name" className="mb-2 block text-sm font-medium text-ink">
              Name
            </label>
            <input
              id="signup-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              className="w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="mb-2 block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <div>
            <label htmlFor="signup-confirm-password" className="mb-2 block text-sm font-medium text-ink">
              Confirm password
            </label>
            <input
              id="signup-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand px-5 py-3 font-semibold text-white transition-colors hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account? {" "}
          <Link
            href={rawCallbackUrl ? `/login?callbackUrl=${encodeURIComponent(rawCallbackUrl)}` : "/login"}
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-120px)]" />}>
      <SignupFormContent />
    </Suspense>
  );
}
