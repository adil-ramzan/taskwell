/**
 * Runs once when the server starts (next dev, next start, the Docker image).
 * Starts the reminder scheduler in the Node.js server only: not in the edge
 * runtime (middleware) and not while `next build` is collecting pages.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startReminderScheduler } = await import("./lib/reminder-scheduler");

    startReminderScheduler();

    // Attached files left without a record (see lib/attachments.ts). Never stops the server from starting.
    const { sweepOrphanedAttachmentFiles } = await import("./lib/attachments");

    void sweepOrphanedAttachmentFiles().catch(() => {});
  }
}
