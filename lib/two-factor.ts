import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";

import { twoFactorThrottle } from "@/lib/password-throttle";
import { prisma } from "@/lib/prisma";

/*
 * TOTP two-factor sign-in (RFC 6238: SHA-1, 6 digits, 30-second steps), built on
 * Node's crypto. The shared secret is stored encrypted with AES-256-GCM under
 * TWO_FACTOR_ENCRYPTION_KEY (32 bytes, base64 or hex), which is server-only and
 * never derived from AUTH_SECRET. Changing that key makes every stored secret
 * unreadable, so it must not be rotated without a re-encryption plan.
 *
 * Recovery codes are random, shown once, stored as SHA-256 hashes and work once.
 * Wrong codes count towards a per-account throttle (5 per 15 minutes).
 * Nothing here logs a secret, a code or the key.
 */

const ISSUER = "Taskwell";
const STEP_SECONDS = 30;
const DIGITS = 6;
const RECOVERY_CODE_COUNT = 10;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export class TwoFactorNotConfiguredError extends Error {
  constructor() {
    super("Two-factor sign-in is not configured on this server.");
    this.name = "TwoFactorNotConfiguredError";
  }
}

function encryptionKey() {
  const raw = process.env.TWO_FACTOR_ENCRYPTION_KEY?.trim() ?? "";
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new TwoFactorNotConfiguredError();
  }

  return key;
}

/** True when the server has a usable encryption key, so 2FA can be offered. */
export function isTwoFactorConfigured() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);

  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

function decrypt(stored: string) {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unreadable two-factor secret.");

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

function toBase32(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  return bits > 0 ? out + BASE32[(value << (5 - bits)) & 31] : out;
}

function fromBase32(text: string) {
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Invalid base32.");

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/** The 6-digit code for a given 30-second step. */
export function totpCode(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const hmac = createHmac("sha1", fromBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Accepts the current code and the ones just before and after it, for clock drift. */
function matchesTotp(secret: string, code: string, now = Date.now()) {
  const step = Math.floor(now / 1000 / STEP_SECONDS);
  const given = Buffer.from(code);

  return [-1, 0, 1].some((drift) => {
    const expected = Buffer.from(totpCode(secret, step + drift));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

const normaliseCode = (code: string) => code.replace(/[\s-]/g, "").toLowerCase();
const hashRecoveryCode = (code: string) => createHash("sha256").update(normaliseCode(code)).digest("hex");

function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = toBase32(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export type SecondFactorCheck = "ok" | "invalid" | "throttled";

/**
 * Checks a second factor for an account that has 2FA on: a 6-digit code from
 * the authenticator app, or an unused recovery code (which is then used up).
 */
export async function checkSecondFactor(userId: string, input: string): Promise<SecondFactorCheck> {
  if (twoFactorThrottle.throttledFor(userId) > 0) return "throttled";

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorSecret: true } });
  if (!user?.twoFactorSecret) return "invalid";

  const code = normaliseCode(input);
  let valid = false;

  if (/^\d{6}$/.test(code)) {
    valid = matchesTotp(decrypt(user.twoFactorSecret), code);
  } else if (/^[a-z2-7]{10}$/.test(code)) {
    // Marking it used in the same statement that finds it, so it can't be used twice.
    const { count } = await prisma.recoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    valid = count > 0;
  }

  if (!valid) {
    twoFactorThrottle.recordFailure(userId);
    return "invalid";
  }

  twoFactorThrottle.clear(userId);
  return "ok";
}

export const verifySecondFactor = async (userId: string, code: string) => (await checkSecondFactor(userId, code)) === "ok";

export async function getTwoFactorStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabledAt: true, _count: { select: { recoveryCodes: { where: { usedAt: null } } } } },
  });

  return {
    enabled: Boolean(user?.twoFactorEnabledAt),
    enabledAt: user?.twoFactorEnabledAt?.toISOString() ?? null,
    recoveryCodesLeft: user?._count.recoveryCodes ?? 0,
    configured: isTwoFactorConfigured(),
  };
}

/**
 * Step 1 of setup: a new secret, kept encrypted as "pending" until confirmed.
 * Returns what the authenticator app needs; this is the only time the secret leaves the server.
 */
export async function startTwoFactorSetup(userId: string, email: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabledAt: true } });
  if (!user) return { error: "not-found" as const };
  if (user.twoFactorEnabledAt) return { error: "already-enabled" as const };

  const secret = toBase32(randomBytes(20));
  await prisma.user.update({ where: { id: userId }, data: { twoFactorPending: encrypt(secret) } });

  const uri = `otpauth://totp/${encodeURIComponent(`${ISSUER}:${email}`)}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  const qr = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 220 });

  return { setup: { secret, uri, qr } };
}

/**
 * Step 2: the first code proves the app is set up. 2FA is turned on, recovery
 * codes are created (returned once), and the session version is raised in the
 * same transaction so every other session ends (the caller re-issues this one).
 * `fromVersion` is the version in the caller's token.
 */
export async function confirmTwoFactorSetup(
  userId: string,
  code: string,
  fromVersion: number,
): Promise<
  | { codes: string[]; version: number }
  | { error: "throttled" | "not-found" | "already-enabled" | "no-setup" | "invalid" | "conflict" }
> {
  if (twoFactorThrottle.throttledFor(userId) > 0) return { error: "throttled" as const };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorPending: true, twoFactorEnabledAt: true },
  });

  if (!user) return { error: "not-found" as const };
  if (user.twoFactorEnabledAt) return { error: "already-enabled" as const };
  if (!user.twoFactorPending) return { error: "no-setup" as const };

  if (!/^\d{6}$/.test(normaliseCode(code)) || !matchesTotp(decrypt(user.twoFactorPending), normaliseCode(code))) {
    twoFactorThrottle.recordFailure(userId);
    return { error: "invalid" as const };
  }

  twoFactorThrottle.clear(userId);
  const codes = newRecoveryCodes();

  const changed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: userId, sessionVersion: fromVersion, twoFactorEnabledAt: null, twoFactorPending: user.twoFactorPending },
      data: {
        twoFactorSecret: user.twoFactorPending,
        twoFactorPending: null,
        twoFactorEnabledAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });

    if (count === 0) return false;

    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.recoveryCode.createMany({ data: codes.map((value) => ({ userId, codeHash: hashRecoveryCode(value) })) });

    return true;
  });

  return changed ? { codes, version: fromVersion + 1 } : { error: "conflict" as const };
}

/** Turns 2FA off: needs the password and a valid code (or recovery code). */
export async function disableTwoFactor(userId: string, password: string, code: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, twoFactorEnabledAt: true },
  });

  if (!user) return { error: "not-found" as const };
  if (!user.twoFactorEnabledAt) return { error: "not-enabled" as const };
  if (twoFactorThrottle.throttledFor(userId) > 0) return { error: "throttled" as const };

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    twoFactorThrottle.recordFailure(userId);
    return { error: "wrong-password" as const };
  }

  const check = await checkSecondFactor(userId, code);
  if (check !== "ok") return { error: check };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: null, twoFactorPending: null, twoFactorEnabledAt: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);

  return { disabled: true as const };
}
