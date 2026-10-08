import { NextResponse } from "next/server";

import { getSessionUserId, jsonError, serverError, withSessionCheck } from "@/lib/api";
import { getReport, loadReportQuery } from "@/lib/reports";

// Always answered for the current session; never cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/reports?[range=&from=&to=&tz=&scope=&teamId=&projectId=&assignee=&status=&priority=]
 * Summary metrics, breakdowns and the trend for the tasks the signed-in user can access.
 */
async function handleGET(request: Request) {
  // The only identity used: IDs in the query string filter, they never grant access.
  const userId = await getSessionUserId();

  if (!userId) {
    return jsonError("You need to sign in to view reports.", 401);
  }

  try {
    const query = await loadReportQuery(userId, new URL(request.url).searchParams);

    if ("error" in query) {
      return jsonError(query.error, query.status);
    }

    return NextResponse.json(await getReport(userId, query.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("reports", "load this report", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
