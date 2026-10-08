"use client";

import { ChevronDown } from "lucide-react";

import type { RecurrenceSummary } from "@/lib/recurrence";
import {
  describeRecurrence,
  isoWeekday,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_MAX_INTERVAL,
  RECURRENCE_MAX_OCCURRENCES,
  recurrenceFrequencyLabels,
  validateRecurrenceInput,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT_NAMES,
  type RecurrenceFrequency,
} from "@/lib/recurrence-rules";

/** The repeat fields as typed; "" for `frequency` means the task doesn't repeat. */
export type RepeatForm = {
  frequency: "" | RecurrenceFrequency;
  interval: string;
  weekdays: number[];
  monthDay: string;
  startDate: string;
  endDate: string;
  occurrenceLimit: string;
};

export const NO_REPEAT: RepeatForm = {
  frequency: "",
  interval: "1",
  weekdays: [],
  monthDay: "",
  startDate: "",
  endDate: "",
  occurrenceLimit: "",
};

/** The form for a saved schedule. One that is switched off shows as "Never" unless `includeInactive`. */
export function repeatFormOf(recurrence: RecurrenceSummary | null | undefined, includeInactive = false): RepeatForm {
  if (!recurrence || (!recurrence.active && !includeInactive)) return NO_REPEAT;

  return {
    frequency: recurrence.frequency,
    interval: String(recurrence.interval),
    weekdays: recurrence.weekdays,
    monthDay: recurrence.monthDay === null ? "" : String(recurrence.monthDay),
    startDate: recurrence.startDate,
    endDate: recurrence.endDate ?? "",
    occurrenceLimit: recurrence.occurrenceLimit === null ? "" : String(recurrence.occurrenceLimit),
  };
}

/**
 * What the API takes for this form: null for "Never", otherwise the schedule
 * or the message that says what is wrong with it. `timeZone` is the zone the
 * dates were entered in, used by the server when the account has none saved.
 */
export function repeatPayload(form: RepeatForm, timeZone: string | null) {
  if (form.frequency === "") return null;

  return validateRecurrenceInput({
    frequency: form.frequency,
    interval: form.interval,
    ...(form.frequency === "WEEKLY" ? { weekdays: form.weekdays } : {}),
    ...(form.frequency === "MONTHLY" ? { monthDay: form.monthDay } : {}),
    startDate: form.startDate,
    endDate: form.endDate,
    occurrenceLimit: form.occurrenceLimit,
    ...(timeZone ? { timeZone } : {}),
  });
}

const fieldClass =
  "w-full min-w-0 rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";
const labelClass = "mb-2 block text-sm font-medium text-ink dark:text-slate-100";
const optionalClass = "font-normal text-muted dark:text-dark-muted";
const hintClass = "text-xs text-muted dark:text-dark-muted";

const unitOf = (frequency: RecurrenceFrequency, plural: boolean) =>
  `${frequency === "DAILY" ? "day" : frequency === "WEEKLY" ? "week" : "month"}${plural ? "s" : ""}`;

interface RecurrenceFieldsProps {
  /** Prefix for the fields' IDs, unique on the page. */
  id: string;
  value: RepeatForm;
  onChange: (value: RepeatForm) => void;
  /** "YYYY-MM-DD" offered as the start date when repeating is first switched on (the due date, or today). */
  defaultStart: string;
  disabled?: boolean;
}

/**
 * The repeat part of a task form: how often, and from when to when. Used by
 * the Create/Edit Task dialog and by the task page's Repeat card.
 */
export default function RecurrenceFields({ id, value, onChange, defaultStart, disabled }: RecurrenceFieldsProps) {
  const set = (changes: Partial<RepeatForm>) => onChange({ ...value, ...changes });
  const { frequency } = value;

  function chooseFrequency(next: "" | RecurrenceFrequency) {
    if (next === "") {
      onChange({ ...value, frequency: "" });
      return;
    }

    // Start from the task's own day, so the usual case needs nothing else filled in.
    const startDate = value.startDate || defaultStart;

    onChange({
      ...value,
      frequency: next,
      startDate,
      weekdays: value.weekdays.length > 0 || !startDate ? value.weekdays : [isoWeekday(startDate)],
      monthDay: value.monthDay || (startDate ? String(Number(startDate.slice(8))) : ""),
    });
  }

  function toggleWeekday(day: number) {
    const weekdays = value.weekdays.includes(day)
      ? value.weekdays.filter((other) => other !== day)
      : [...value.weekdays, day].sort((a, b) => a - b);

    set({ weekdays });
  }

  const interval = Number(value.interval);
  const preview =
    frequency !== "" && Number.isInteger(interval) && interval >= 1
      ? describeRecurrence({
          frequency,
          interval,
          weekdays: frequency === "WEEKLY" ? value.weekdays : [],
          monthDay: frequency === "MONTHLY" && Number(value.monthDay) >= 1 ? Number(value.monthDay) : null,
        })
      : "";

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <legend className="sr-only">Repeat</legend>
      <div>
        <label htmlFor={`${id}-frequency`} className={labelClass}>
          Repeat
        </label>
        <div className="relative">
          <select
            id={`${id}-frequency`}
            value={frequency}
            onChange={(event) => chooseFrequency(event.target.value as "" | RecurrenceFrequency)}
            className={`${fieldClass} appearance-none pr-10`}
          >
            <option value="">Never</option>
            {RECURRENCE_FREQUENCIES.map((option) => (
              <option key={option} value={option}>
                {recurrenceFrequencyLabels[option]}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
          />
        </div>
      </div>

      {frequency !== "" && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={`${id}-interval`} className={labelClass}>
                Every
              </label>
              <div className="flex items-center gap-3">
                <input
                  id={`${id}-interval`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={RECURRENCE_MAX_INTERVAL}
                  step={1}
                  required
                  value={value.interval}
                  onChange={(event) => set({ interval: event.target.value })}
                  aria-describedby={`${id}-interval-unit`}
                  className={`${fieldClass} max-w-[7rem]`}
                />
                <span id={`${id}-interval-unit`} className="text-sm text-muted dark:text-dark-muted">
                  {unitOf(frequency, value.interval !== "1")}
                </span>
              </div>
            </div>

            {frequency === "MONTHLY" && (
              <div className="min-w-0">
                <label htmlFor={`${id}-month-day`} className={labelClass}>
                  Day of the month
                </label>
                <input
                  id={`${id}-month-day`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  step={1}
                  required
                  value={value.monthDay}
                  onChange={(event) => set({ monthDay: event.target.value })}
                  aria-describedby={`${id}-month-day-hint`}
                  className={`${fieldClass} max-w-[7rem]`}
                />
              </div>
            )}

            {frequency === "MONTHLY" && (
              <p id={`${id}-month-day-hint`} className={`-mt-3 sm:col-span-2 ${hintClass}`}>
                A month with fewer days uses its last day, so day 31 is also 30 April and 28 or 29 February.
              </p>
            )}
          </div>

          {frequency === "WEEKLY" && (
            <div role="group" aria-labelledby={`${id}-weekdays-label`}>
              <p id={`${id}-weekdays-label`} className={labelClass}>
                On
              </p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_NAMES.map((name, index) => {
                  const day = index + 1;
                  const pressed = value.weekdays.includes(day);

                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={pressed}
                      aria-label={name}
                      onClick={() => toggleWeekday(day)}
                      className={`inline-flex min-h-11 min-w-[3.25rem] items-center justify-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-dark-surface ${
                        pressed
                          ? "border-brand bg-brand text-white"
                          : "border-ink/15 bg-white text-ink hover:border-brand hover:text-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
                      }`}
                    >
                      {WEEKDAY_SHORT_NAMES[index]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={`${id}-start`} className={labelClass}>
                Starts
              </label>
              <input
                id={`${id}-start`}
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                required
                value={value.startDate}
                onChange={(event) => set({ startDate: event.target.value })}
                className={`${fieldClass} dark:[color-scheme:dark]`}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${id}-end`} className={labelClass}>
                Ends <span className={optionalClass}>(optional)</span>
              </label>
              <input
                id={`${id}-end`}
                type="date"
                min={value.startDate || "2000-01-01"}
                max="2100-12-31"
                value={value.endDate}
                onChange={(event) => set({ endDate: event.target.value })}
                className={`${fieldClass} dark:[color-scheme:dark]`}
              />
            </div>
          </div>

          <div className="min-w-0">
            <label htmlFor={`${id}-limit`} className={labelClass}>
              Stop after <span className={optionalClass}>(optional)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                id={`${id}-limit`}
                type="number"
                inputMode="numeric"
                min={1}
                max={RECURRENCE_MAX_OCCURRENCES}
                step={1}
                value={value.occurrenceLimit}
                onChange={(event) => set({ occurrenceLimit: event.target.value })}
                aria-describedby={`${id}-limit-unit ${id}-repeat-hint`}
                className={`${fieldClass} max-w-[7rem]`}
              />
              <span id={`${id}-limit-unit`} className="text-sm text-muted dark:text-dark-muted">
                {value.occurrenceLimit === "1" ? "occurrence" : "occurrences"}
              </span>
            </div>
          </div>

          <p id={`${id}-repeat-hint`} className={hintClass}>
            {preview && <span className="font-medium text-ink dark:text-slate-100">{preview}. </span>}
            Completing the task creates the next one, due on the next of these days. It repeats until the end date or
            the number of occurrences, whichever comes first, or until repeating is turned off.
          </p>
        </>
      )}
    </fieldset>
  );
}
