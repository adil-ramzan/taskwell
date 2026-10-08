"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";

import { TEAM_DESCRIPTION_MAX_LENGTH, TEAM_NAME_MAX_LENGTH, validateTeamInput } from "@/lib/team-validation";

const fieldClass =
  "w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";
const labelClass = "mb-2 block text-sm font-medium text-ink dark:text-slate-100";

interface TeamSettingsFormProps {
  team: { id: string; name: string; description: string | null };
}

/** Name and description form for owners and admins; the server re-checks the role. */
export default function TeamSettingsForm({ team }: TeamSettingsFormProps) {
  const router = useRouter();
  const id = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const result = validateTeamInput({ name: formData.get("name"), description: formData.get("description") });

    setSaved(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn't update this team right now. Please try again.",
        );
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>
          Team name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          required
          maxLength={TEAM_NAME_MAX_LENGTH}
          defaultValue={team.name}
          aria-describedby={error ? `${id}-error` : undefined}
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor={`${id}-description`} className={labelClass}>
          Description <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
        </label>
        <textarea
          id={`${id}-description`}
          name="description"
          rows={3}
          maxLength={TEAM_DESCRIPTION_MAX_LENGTH}
          defaultValue={team.description ?? ""}
          className={`${fieldClass} resize-y`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface"
        >
          {submitting ? "Saving..." : "Save changes"}
        </button>
        <p role="status" className="text-sm text-muted dark:text-dark-muted">
          {saved ? "Changes saved." : ""}
        </p>
      </div>
    </form>
  );
}
