import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function createSubscriber(email: string) {
  return prisma.subscriber.create({
    data: { email },
    select: { id: true },
  });
}

export async function getSubscriberCount(): Promise<number | null> {
  try {
    return await prisma.subscriber.count();
  } catch {
    return null;
  }
}

export function isDuplicateSubscriberError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}