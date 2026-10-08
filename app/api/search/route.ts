import { NextResponse } from "next/server";

import { getSessionUserId, jsonError, serverError, withSessionCheck } from "@/lib/api";
import { searchForUser } from "@/lib/search";
import { validateSearchQuery } from "@/lib/search-validation";

// Always answered for the current session; never cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=
 * Tasks, projects and teams matching q that the signed-in user can access,
 * a few of each. Used by the command palette.
 */
async function handleGET(request: Request) {
  // The only identity used: nothing in the query string grants access.
  const userId = await getSessionUserId();

  if (!userId) {
    return jsonError("You need to sign in to search.", 401);
  }

  const query = validateSearchQuery(new URL(request.url).searchParams.get("q"));

  if ("error" in query) {
    return jsonError(query.error, 400);
  }

  try {
    return NextResponse.json(
      { query: query.data, results: await searchForUser(userId, query.data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return serverError("search", "search", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
