"use client";

import { Check, Copy, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useRef, useState } from "react";

import FormattedDate from "./FormattedDate";
import { errorClass, fieldClass, labelClass, primaryButtonClass, successClass } from "./settings-styles";

const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";

interface TwoFactorSectionProps {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
  /** False when the server has no encryption key, so 2FA can't be offered. */
  configured: boolean;
}

type Setup = { secret: string; uri: string; qr: string };

/**
 * Two-factor sign-in with an authenticator app: set up (QR or key, then a code
 * to confirm), recovery codes shown once, and turning it off with password + code.
 */
export default function TwoFactorSection({ enabled, enabledAt, recoveryCodesLeft, configured }: TwoFactorSectionProps) {
  const router = useRouter();
  const id = useId();
  const busy = useRef(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  async function call(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong. Please try again.");
    }

    return payload;
  }

  async function run(task: () => Promise<void>) {
    if (busy.current) return;

    busy.current = true;
    setWorking(true);
    setError("");
    setNotice("");

    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reach the server. Check your connection and try again.");
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  const start = () =>
    run(async () => {
      const payload = await call("/api/account/two-factor", { method: "POST" });
      setSetup(payload?.setup as Setup);
    });

  const confirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();

    if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    run(async () => {
      const payload = await call("/api/account/two-factor/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      setSetup(null);
      setCodes(payload?.recoveryCodes as string[]);
    });
  };

  const disable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const code = String(form.get("code") ?? "").trim();

    if (!password || !code) {
      setError("Enter your password and a code from your authenticator app (or a recovery code).");
      return;
    }

    run(async () => {
      await call("/api/account/two-factor", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, code }),
      });
      setNotice("Two-factor sign-in is off.");
      router.refresh();
    });
  };

  async function copyCodes() {
    if (!codes) return;

    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const messages = (
    <>
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={successClass}>
          {notice}
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-4 border-t border-ink/10 px-5 py-5 dark:border-white/10">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-slate-100">
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          Two-factor sign-in
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-muted dark:bg-white/10 dark:text-dark-muted">
            {enabled ? "On" : "Off"}
          </span>
        </h3>
        <p className="mt-1 text-sm text-muted dark:text-dark-muted">
          {enabled ? (
            <>
              Signing in needs a code from your authenticator app. On since{" "}
              {enabledAt ? <FormattedDate value={enabledAt} /> : "recently"}; {recoveryCodesLeft} unused recovery{" "}
              {recoveryCodesLeft === 1 ? "code" : "codes"} left.
            </>
          ) : (
            "Add a second step to signing in: a 6-digit code from an authenticator app such as Google Authenticator, 1Password or Authy."
          )}
        </p>
      </div>

      {codes && (
        <div role="status" className="space-y-3 rounded-xl border border-emerald-600/30 bg-emerald-50 p-4 text-sm text-ink dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-slate-100">
          <p className="font-semibold">Two-factor sign-in is on. Your other devices were signed out.</p>
          <p>
            Save these recovery codes somewhere safe. Each works once if you lose your phone. They won&apos;t be shown
            again.
          </p>
          <ul aria-label="Recovery codes" className="grid grid-cols-2 gap-2 font-mono text-sm">
            {codes.map((code) => (
              <li key={code} className="rounded bg-white px-2 py-1 dark:bg-dark-background">
                {code}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={copyCodes} className={secondaryButtonClass}>
              {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
              {copied ? "Copied" : "Copy codes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCodes(null);
                router.refresh();
              }}
              className={primaryButtonClass}
            >
              I&apos;ve saved them
            </button>
          </div>
        </div>
      )}

      {!codes && !enabled && !configured && (
        <p className="text-sm text-muted dark:text-dark-muted">Two-factor sign-in isn&apos;t available on this server yet.</p>
      )}

      {!codes && !enabled && configured && !setup && (
        <>
          {messages}
          <div className="flex justify-end">
            <button type="button" onClick={start} disabled={working} className={`${secondaryButtonClass} w-full sm:w-auto`}>
              {working ? "Starting..." : "Set up two-factor sign-in"}
            </button>
          </div>
        </>
      )}

      {!codes && setup && (
        <form onSubmit={confirm} noValidate className="space-y-4">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-ink dark:text-slate-100">
            <li>
              Scan this QR code with your authenticator app.
              {/* eslint-disable-next-line @next/next/no-img-element -- generated on the server as a data URL */}
              <img src={setup.qr} alt="QR code to add Taskwell to your authenticator app" width={176} height={176} className="mt-2 rounded-lg bg-white p-2" />
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-brand-dark dark:text-slate-100">Can&apos;t scan it? Enter a key instead</summary>
                <p className="mt-1 break-all font-mono text-sm" aria-label="Setup key">
                  {setup.secret.match(/.{1,4}/g)?.join(" ")}
                </p>
              </details>
            </li>
            <li>
              <label htmlFor={`${id}-confirm`} className={labelClass}>
                Enter the 6-digit code it shows
              </label>
              <input id={`${id}-confirm`} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className={fieldClass} />
            </li>
          </ol>
          <p className="text-xs text-muted dark:text-dark-muted">Turning it on signs out your other devices; this one stays signed in.</p>
          {messages}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setSetup(null)} disabled={working} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={working} className={primaryButtonClass}>
              {working ? "Checking..." : "Turn on"}
            </button>
          </div>
        </form>
      )}

      {!codes && enabled && (
        <form onSubmit={disable} noValidate className="space-y-4">
          <p className="text-sm font-medium text-ink dark:text-slate-100">Turn off two-factor sign-in</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-password`} className={labelClass}>
                Password
              </label>
              <input id={`${id}-password`} name="password" type="password" autoComplete="current-password" className={fieldClass} />
            </div>
            <div>
              <label htmlFor={`${id}-code`} className={labelClass}>
                Code or recovery code
              </label>
              <input id={`${id}-code`} name="code" type="text" autoComplete="one-time-code" className={fieldClass} />
            </div>
          </div>
          {messages}
          <div className="flex justify-end">
            <button type="submit" disabled={working} className={`${secondaryButtonClass} w-full sm:w-auto`}>
              {working ? "Turning off..." : "Turn off"}
            </button>
          </div>
        </form>
      )}

    </div>
  );
}
