import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { cache } from "react";

import { validateName } from "@/lib/account-validation";
import { prisma } from "@/lib/prisma";

const BCRYPT_COST = 10;
// Compared against when no account has the email, so an unknown email takes as
// long to refuse as a wrong password (no timing difference to probe accounts with).
const DUMMY_HASH = bcrypt.hashSync("taskwell-no-such-account", BCRYPT_COST);

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function createUser({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}) {
  const validName = validateName(name);
  const normalizedEmail = normalizeEmail(email);

  if ("error" in validName || !normalizedEmail || !password) {
    throw new Error("Please complete all required fields.");
  }

  const normalizedName = validName.data;

  if (await findUserByEmail(normalizedEmail)) {
    throw new Error("An account with that email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await prisma.user.create({
    data: {
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
    },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export async function validateUserCredentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    sessionVersion: user.sessionVersion,
    twoFactorEnabled: user.twoFactorEnabledAt !== null,
  };
}

/**
 * The account's current session version, or null when the account no longer
 * exists. Deduplicated per request, since a page can check the session several times.
 */
export const getSessionVersion = cache(async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });

  return user?.sessionVersion ?? null;
});

/** Sets or clears (null) the account's time zone; the caller passes a validated IANA name. */
export async function updateUserTimeZone(userId: string, timeZone: string | null) {
  const { count } = await prisma.user.updateMany({ where: { id: userId }, data: { timeZone } });

  return count > 0;
}

/** Renames the account; the caller passes a validated name and the session's user ID. */
export async function updateUserName(userId: string, name: string) {
  const { count } = await prisma.user.updateMany({ where: { id: userId }, data: { name } });

  return count > 0;
}

/**
 * Checks the current password and, if it is right, stores the new one and raises
 * the session version in one update, which signs the account out everywhere.
 * Matching on the version that was read means two simultaneous changes can't
 * both succeed.
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<"changed" | "wrong-password" | "not-found"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, sessionVersion: true },
  });

  if (!user) return "not-found";
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return "wrong-password";

  const { count } = await prisma.user.updateMany({
    where: { id: userId, sessionVersion: user.sessionVersion },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST), sessionVersion: { increment: 1 } },
  });

  return count > 0 ? "changed" : "not-found";
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
}

// Summarises an error for server logs without leaking secrets: validation errors
// can echo query arguments (e.g. passwordHash), so only their name is kept.
export function describeError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { name: error.name, code: error.errorCode, message: error.message };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return { name: error.name, code: error.code, meta: error.meta };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return { name: error.name };
  }

  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  return { name: typeof error };
}

/** True when Prisma could not reach the database (vs. a bad query or constraint). */
export function isDatabaseUnavailable(error: unknown) {
  return (
    (error instanceof Error && error.name === "SessionUnavailableError") ||
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P1001", "P1002", "P1017"].includes(error.code))
  );
}
