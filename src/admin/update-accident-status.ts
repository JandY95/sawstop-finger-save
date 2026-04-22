import {
  ACCIDENT_STATUS,
  CUSTOMER_FAILURE_MESSAGE
} from "../constants.ts";
import {
  getAccidentPageStatus,
  updateAccidentPageStatus
} from "../notion.ts";
import type {
  AdminUpdateAccidentStatusFailureResponse,
  AdminUpdateAccidentStatusRequest,
  AdminUpdateAccidentStatusSuccessResponse,
  WorkerEnv
} from "../types.ts";

const ALLOWED_TRANSITIONS = new Map<string, Set<string>>([
  [ACCIDENT_STATUS.received, new Set([ACCIDENT_STATUS.inProgress, ACCIDENT_STATUS.rejected])],
  [ACCIDENT_STATUS.inProgress, new Set([ACCIDENT_STATUS.complete])]
]);

function jsonResponse(
  body:
    | AdminUpdateAccidentStatusSuccessResponse
    | AdminUpdateAccidentStatusFailureResponse,
  status: number
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function isAllowedTransition(fromStatus: string, toStatus: string) {
  return ALLOWED_TRANSITIONS.get(fromStatus)?.has(toStatus) ?? false;
}

export async function handleAdminUpdateAccidentStatus(
  request: Request,
  env: WorkerEnv
) {
  try {
    const body =
      (await request.json()) as Partial<AdminUpdateAccidentStatusRequest>;
    const pageId = String(body.pageId ?? "").trim();
    const fromStatus = String(body.fromStatus ?? "").trim();
    const toStatus = String(body.toStatus ?? "").trim();

    if (
      pageId.length === 0 ||
      fromStatus.length === 0 ||
      toStatus.length === 0 ||
      !isAllowedTransition(fromStatus, toStatus)
    ) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }

    const currentStatus = await getAccidentPageStatus(env, pageId);
    if (currentStatus !== fromStatus) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        409
      );
    }

    await updateAccidentPageStatus(env, { pageId, status: toStatus });

    return jsonResponse(
      {
        ok: true,
        status: toStatus
      },
      200
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        message: CUSTOMER_FAILURE_MESSAGE
      },
      500
    );
  }
}
