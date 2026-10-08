"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ChangeEvent } from "react";

import { AVATAR_ACCEPT, AVATAR_MAX_BYTES, PRESET_AVATARS, type AvatarRef } from "@/lib/avatars";
import { errorClass, successClass } from "./settings-styles";
import UserAvatar, { getInitials, presetIcons } from "./UserAvatar";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const optionClass =
  "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-white peer-checked:ring-2 peer-checked:ring-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-brand peer-disabled:cursor-not-allowed dark:ring-offset-dark-surface";

interface AvatarPickerProps {
  name: string;
  email: string;
  avatar: AvatarRef | null;
}

type Status = { ok: boolean; message: string } | null;

/**
 * Upload a picture, pick a built-in avatar, or use initials. Each choice is
 * saved straight away; the server re-checks everything (file contents, the
 * built-in ID) and decides whose avatar changes from the session.
 */
export default function AvatarPicker({ name, email, avatar }: AvatarPickerProps) {
  const router = useRouter();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [current, setCurrent] = useState<AvatarRef | null>(avatar);
  const [saving, setSaving] = useState<"upload" | "choose" | "remove" | null>(null);
  const [status, setStatus] = useState<Status>(null);

  async function send(kind: "upload" | "choose" | "remove", init: RequestInit, success: string) {
    if (busy.current) return;

    busy.current = true;
    setSaving(kind);
    setStatus(null);

    try {
      const response = await fetch("/api/account/avatar", init);
      const payload = (await response.json().catch(() => null)) as { error?: unknown; avatar?: AvatarRef | null } | null;

      if (!response.ok) {
        setStatus({
          ok: false,
          message: typeof payload?.error === "string" ? payload.error : "We couldn't update your picture right now. Please try again.",
        });
        return;
      }

      setCurrent(kind === "remove" ? null : (payload?.avatar ?? null));
      setStatus({ ok: true, message: success });
      // Shows the new picture in the sidebar and everywhere else on the page.
      router.refresh();
    } catch {
      setStatus({ ok: false, message: "Unable to reach the server. Check your connection and try again." });
    } finally {
      busy.current = false;
      setSaving(null);
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    // Quick checks for a clear message; the server decides from the file's contents.
    if (file.size > AVATAR_MAX_BYTES) {
      setStatus({ ok: false, message: "Choose an image of 2 MB or less." });
      return;
    }

    const body = new FormData();
    body.append("file", file);
    send("upload", { method: "POST", body }, "Your picture was updated.");
  }

  function choose(preset: string | null) {
    send(
      "choose",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset }) },
      preset ? "Your avatar was updated." : "Your avatar now shows your initials.",
    );
  }

  const selected = current?.kind === "preset" ? current.id : current?.kind === "upload" ? "upload" : "initials";

  return (
    <div className="space-y-5 border-b border-ink/10 px-5 py-5 dark:border-white/10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <UserAvatar name={name} email={email} avatar={current} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink dark:text-slate-100">Profile picture</p>
          <p id={`${id}-hint`} className="mt-1 text-xs text-muted dark:text-dark-muted">
            JPG, PNG or WebP, up to 2 MB. It&apos;s cropped to a square and only shown to you and your teammates.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input
              ref={fileRef}
              id={`${id}-file`}
              type="file"
              accept={AVATAR_ACCEPT}
              onChange={upload}
              disabled={saving !== null}
              aria-describedby={`${id}-hint`}
              // Opened by the Upload button, which is the visible, focusable control.
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={saving !== null}
              aria-describedby={`${id}-hint`}
              className={buttonClass}
            >
              <ImageUp aria-hidden="true" className="h-4 w-4" />
              {saving === "upload" ? "Uploading..." : current?.kind === "upload" ? "Replace picture" : "Upload picture"}
            </button>
            {current !== null && (
              <button
                type="button"
                onClick={() => send("remove", { method: "DELETE" }, "Your picture was removed; your initials are shown instead.")}
                disabled={saving !== null}
                className={buttonClass}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                {saving === "remove" ? "Removing..." : "Remove"}
              </button>
            )}
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink dark:text-slate-100">Or choose an avatar</legend>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="relative">
            <input
              type="radio"
              name={`${id}-avatar`}
              value="initials"
              checked={selected === "initials"}
              onChange={() => choose(null)}
              disabled={saving !== null}
              className="peer sr-only"
            />
            <span className={`${optionClass} bg-brand/10 text-xs font-semibold text-brand-dark dark:bg-brand/25 dark:text-slate-50`}>
              {getInitials(name, email)}
            </span>
            <span className="sr-only">Initials</span>
          </label>
          {PRESET_AVATARS.map((preset) => {
            const Icon = presetIcons[preset.id];

            return (
              <label key={preset.id} className="relative">
                <input
                  type="radio"
                  name={`${id}-avatar`}
                  value={preset.id}
                  checked={selected === preset.id}
                  onChange={() => choose(preset.id)}
                  disabled={saving !== null}
                  className="peer sr-only"
                />
                <span className={optionClass} style={{ backgroundColor: preset.background, color: preset.foreground }}>
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <span className="sr-only">{preset.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {status && (
        <p role={status.ok ? "status" : "alert"} className={status.ok ? successClass : errorClass}>
          {status.message}
        </p>
      )}
    </div>
  );
}
