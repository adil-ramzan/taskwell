import "server-only";

import { processDueReminders } from "@/lib/reminders";
import { describeError, isDatabaseUnavailable } from "@/lib/users";

/*
 * The reminder scheduler: a timer inside the server process, started once from
 * instrumentation.ts when the server boots (next dev, next start, Docker).
 * Every tick it asks the database for reminders whose time has come and turns
 * them into notifications (lib/reminders.ts).
 *
 * Nothing is kept in memory: what is due, and what has been sent, lives in
 * PostgreSQL, so a restart loses nothing (overdue reminders go out on the first
 * tick) and several server processes can run this side by side without sending
 * anything twice.
 */

const DEFAULT_INTERVAL_MS = 20_000;
const MIN_INTERVAL_MS = 1_000;

/** REMINDER_POLL_MS overrides the 20-second default (never below one second). */
function intervalMs() {
  const configured = Number(process.env.REMINDER_POLL_MS);

  return Number.isFinite(configured) && configured >= MIN_INTERVAL_MS ? configured : DEFAULT_INTERVAL_MS;
}

type SchedulerState = { timer: NodeJS.Timeout; running: boolean; failing: boolean };

// One per process, also across hot reloads in development.
const holder = globalThis as typeof globalThis & { taskwellReminderScheduler?: SchedulerState };

async function tick(state: SchedulerState) {
  // A slow run is never overlapped by the next one in the same process.
  if (state.running) return;

  state.running = true;

  try {
    // Keep going while there are full batches waiting (after downtime, say).
    for (let batches = 0; batches < 25; batches += 1) {
      const { processed } = await processDueReminders();

      if (processed < 200) break;
    }

    if (state.failing) {
      console.info("[reminders] The database is reachable again; reminders are being sent.");
      state.failing = false;
    }
  } catch (error) {
    // Logged once per outage, not every tick. Nothing is lost: the reminders stay due.
    if (!state.failing) {
      console.error(
        `[reminders] Could not process reminders${isDatabaseUnavailable(error) ? " (database unavailable)" : ""}:`,
        describeError(error),
      );
      state.failing = true;
    }
  } finally {
    state.running = false;
  }
}

export function startReminderScheduler() {
  if (holder.taskwellReminderScheduler || process.env.REMINDER_SCHEDULER === "off") return;

  const state: SchedulerState = { timer: undefined as unknown as NodeJS.Timeout, running: false, failing: false };

  state.timer = setInterval(() => void tick(state), intervalMs());
  // The timer alone never keeps the process alive.
  state.timer.unref();
  holder.taskwellReminderScheduler = state;
}
