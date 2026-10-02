import { NextResponse } from "next/server";

import {
  createSubscriber,
  isDuplicateSubscriberError,
} from "@/lib/subscribers";

export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const candidate = (body as { email?: unknown }).email;

  if (typeof candidate !== "string") {
    return NextResponse.json(
      { success: false, message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const email = candidate.trim().toLowerCase();

  if (!email) {
    return NextResponse.json(
      { success: false, message: "Enter your email address." },
      { status: 400 },
    );
  }

  if (email.length > 254 || !emailPattern.test(email)) {
    return NextResponse.json(
      { success: false, message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    await createSubscriber(email);

    return NextResponse.json(
      {
        success: true,
        message:
          "You're on the list. Email confirmation isn't configured yet.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (isDuplicateSubscriberError(error)) {
      return NextResponse.json(
        { success: false, message: "This email is already subscribed." },
        { status: 409 },
      );
    }

    console.error("Subscriber signup could not be saved.");

    return NextResponse.json(
      {
        success: false,
        message: "Signup is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }
}