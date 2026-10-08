import { NextResponse, type NextRequest } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { currentToken, raiseSessionVersion, reissueSessionCookie } from "@/lib/session-cookie";
import { getSessionUserId, serverError, unauthorized } from "../_shared";

/**
 * "Sign out other devices": every session of the signed-in account except the
 * one making this request stops working. Takes no body.
 */
async function handleDELETE(request: NextRequest) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const token = await currentToken(request, userId);
    const version = token ? await raiseSessionVersion(userId, token) : null;

    if (!token || version === null) {
      return unauthorized();
    }

    const response = NextResponse.json({ signedOutOtherDevices: true });
    await reissueSessionCookie(response, token, version);

    return response;
  } catch (error) {
    return serverError("sign out your other devices", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const DELETE = withSessionCheck(handleDELETE);
