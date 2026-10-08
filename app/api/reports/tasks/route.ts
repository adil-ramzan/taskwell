import { NextResponse } from "next/server";

import { getSessionUserId, jsonError, serverError, withSessionCheck } from "@/lib/api";
import { listReportTasks, loadReportQuery, parseReportList, parseReportPage } from "@/lib/reports";

// Always answered for the current session; never cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/tasks?[list=&page=] plus the same filters as /api/reports
 * One page of the report's task table.
 */
async function handleGET(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return jsonError("You need to sign in to view reports.", 401);
  }

  const params = new URL(request.url).searchParams;
  const list = parseReportList(params);
  const page = parseReportPage(params);

  if ("error" in list) return jsonError(list.error, list.status);
  if ("error" in page) return jsonError(page.error, page.status);

  try {
    const query = await loadReportQuery(userId, params);

    if ("error" in query) {
      return jsonError(query.error, query.status);
    }

    return NextResponse.json(await listReportTasks(userId, query.data, list.data, page.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return serverError("reports", "load this report's tasks", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
