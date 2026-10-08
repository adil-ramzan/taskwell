import { getSessionUserId, jsonError, serverError, withSessionCheck } from "@/lib/api";
import { REPORT_EXPORT_LIMIT } from "@/lib/report-dates";
import { exportReportCsv, loadReportQuery, parseReportList } from "@/lib/reports";

// Always answered for the current session; never cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/export?format=csv[&list=] plus the same filters as /api/reports
 * The report's task list as a CSV download. It goes through the same query
 * check and the same access rule as the report itself.
 */
async function handleGET(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return jsonError("You need to sign in to export reports.", 401);
  }

  const params = new URL(request.url).searchParams;

  if ((params.get("format") ?? "csv") !== "csv") {
    return jsonError("Reports can be exported as CSV only (format=csv).", 400);
  }

  const list = parseReportList(params);

  if ("error" in list) return jsonError(list.error, list.status);

  try {
    const query = await loadReportQuery(userId, params);

    if ("error" in query) {
      return jsonError(query.error, query.status);
    }

    const result = await exportReportCsv(userId, query.data, list.data);

    if ("tooMany" in result) {
      return jsonError(
        `This selection has ${result.tooMany} tasks; an export holds at most ${REPORT_EXPORT_LIMIT}. Narrow the filters or the date range and try again.`,
        400,
      );
    }

    const { from, to } = query.data.range;

    return new Response(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // Day keys only, so the name needs no escaping.
        "Content-Disposition": `attachment; filename="taskwell-report-${from}_to_${to}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return serverError("reports", "export this report", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
