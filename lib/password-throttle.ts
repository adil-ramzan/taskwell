import "server-only";

/*
 * Attempt throttles for the account forms: after 5 failures for one key within
 * 15 minutes, further attempts are refused until 15 minutes after the first
 * failure. Keys are a user ID or a normalised email; nothing about the password
 * or code itself is stored.
 *
 * These are in-memory, per-process throttles. They reset when the server
 * restarts and are not shared between several instances of the app, so they
 * are not a replacement for a distributed rate limiter in production.
 */
export const MAX_FAILED_ATTEMPTS = 5;
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
// Old entries are swept once the map gets this big, so a flood of distinct keys can't grow it forever.
const SWEEP_AT = 10_000;

function createThrottle() {
  const failures = new Map<string, { count: number; firstAt: number }>();

  function current(key: string, now: number) {
    const entry = failures.get(key);

    if (entry && now - entry.firstAt >= THROTTLE_WINDOW_MS) {
      failures.delete(key);
      return undefined;
    }

    return entry;
  }

  return {
    /** Seconds until the key may try again; 0 when it isn't throttled. */
    throttledFor(key: string, now = Date.now()) {
      const entry = current(key, now);

      return entry && entry.count >= MAX_FAILED_ATTEMPTS
        ? Math.ceil((entry.firstAt + THROTTLE_WINDOW_MS - now) / 1000)
        : 0;
    },

    recordFailure(key: string, now = Date.now()) {
      const entry = current(key, now);

      if (entry) {
        entry.count += 1;
        return;
      }

      if (failures.size >= SWEEP_AT) {
        for (const [stale, value] of failures) {
          if (now - value.firstAt >= THROTTLE_WINDOW_MS) failures.delete(stale);
        }
      }

      failures.set(key, { count: 1, firstAt: now });
    },

    clear(key: string) {
      failures.delete(key);
    },
  };
}

/** Wrong current passwords on the change-password form, per user ID. */
const passwordChange = createThrottle();
/** Failed sign-ins, per normalised email (unknown emails are counted exactly like real ones). */
export const loginThrottle = createThrottle();
/** Wrong two-factor codes, per user ID (sign-in, setup and disabling). */
export const twoFactorThrottle = createThrottle();

// The change-password throttle keeps its original interface.
export const throttledFor = (userId: string, now = Date.now()) => passwordChange.throttledFor(userId, now);
export const recordFailedAttempt = (userId: string, now = Date.now()) => passwordChange.recordFailure(userId, now);
export const clearFailedAttempts = (userId: string) => passwordChange.clear(userId);
