import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { PASSWORD_MIN_LENGTH, validateName } from "@/lib/account-validation";
import { createUser, describeError } from "@/lib/users";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Please complete all required fields." },
      { status: 400 },
    );
  }

  const payload = body as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
  };
  const validName = validateName(payload.name);
  const name = "error" in validName ? "" : validName.data;
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!name || !email || !password) {
    // A name that is present but too long gets its own message; the limit is shared with Settings.
    const tooLong = "error" in validName && typeof payload.name === "string" && payload.name.trim() !== "";

    return NextResponse.json(
      { error: tooLong ? validName.error : "Please complete all required fields." },
      { status: 400 },
    );
  }

  if (email.length > 254 || !emailPattern.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.` },
      { status: 400 },
    );
  }

  try {
    const user = await createUser({ name, email, password });

    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );
    }

    if (
      error instanceof Error &&
      error.message === "An account with that email already exists."
    ) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 },
      );
    }

    // Log the underlying cause (e.g. Prisma P1001 when the database is unreachable).
    // Never log the request body: it contains the password.
    console.error("[register] User registration could not be completed:", describeError(error));

    const databaseUnavailable =
      error instanceof Prisma.PrismaClientInitializationError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P1001", "P1002", "P1017"].includes(error.code));

    if (databaseUnavailable) {
      return NextResponse.json(
        { error: "Unable to create your account right now." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Unable to create your account right now." },
      { status: 500 },
    );
  }
}
