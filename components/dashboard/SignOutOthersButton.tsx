"use client";

import { MonitorSmartphone } from "lucide-react";
import { useState } from "react";

import ConfirmDeleteButton from "./ConfirmDeleteButton";
import { successClass } from "./settings-styles";

const buttonClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100 sm:w-auto";

/** Ends every other session of the account after a confirmation; this browser stays signed in. */
export default function SignOutOthersButton() {
  const [done, setDone] = useState(false);

  return (
    <div className="space-y-3 border-t border-ink/10 px-5 py-5 dark:border-white/10">
      <div>
        <h3 className="text-sm font-semibold text-ink dark:text-slate-100">Sign out other devices</h3>
        <p className="mt-1 text-sm text-muted dark:text-dark-muted">
          This will sign out your other active sessions. This device will remain signed in.
        </p>
      </div>
      {done && (
        <p role="status" className={successClass}>
          Your other devices were signed out. This device is still signed in.
        </p>
      )}
      <div className="flex justify-end">
        <ConfirmDeleteButton
          className={buttonClass}
          title="Sign out other devices"
          noun="session"
          verb="sign out"
          endpoint="/api/account/sessions"
          onDeleted={() => setDone(true)}
          description={
            <>
              <p>Every other browser and device signed in to your account will be signed out and will need your password again.</p>
              <p>This device will remain signed in.</p>
            </>
          }
        >
          <MonitorSmartphone aria-hidden="true" className="h-4 w-4" />
          Sign out other devices
        </ConfirmDeleteButton>
      </div>
    </div>
  );
}
