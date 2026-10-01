import {
  ACCIDENT_STATUS,
  CUSTOMER_FAILURE_MESSAGE
} from "../constants.ts";
import {
  appendAccidentReportDraftIfMissing,
  getAccidentPageStatus,
  getAccidentSendReadyGateState,
  reportNotionOwnershipError,
  resetAccidentReportReviewFlags,
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

function buildCompletionBlockedMessage(
  gate: Awaited<ReturnType<typeof getAccidentSendReadyGateState>>
) {
  const incompleteReviewLabels = Object.entries(gate.reviewValues)
    .filter(([, complete]) => !complete)
    .map(([key]) => {
      if (key === "englishReviewComplete") {
        return "영문 검수 완료";
      }
      if (key === "attachmentFinalCheck") {
        return "첨부 최종 확인 완료";
      }
      return "출력 확인 완료";
    });
  const reasons: string[] = [];

  if (incompleteReviewLabels.length > 0) {
    reasons.push(`미완료 검수: ${incompleteReviewLabels.join(", ")}`);
  }
  if (!gate.autoSendReady) {
    reasons.push("발송 준비 완료(자동)이 false입니다.");
  }
  if (gate.blockingMarkers.length > 0) {
    reasons.push(`본문에 ${gate.blockingMarkers.join(", ")} 표시가 남아 있습니다.`);
  }

  return `완료 처리할 수 없습니다. ${reasons.join(" ")} 확인 후 다시 시도해 주세요.`;
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

    if (
      fromStatus === ACCIDENT_STATUS.received &&
      toStatus === ACCIDENT_STATUS.inProgress
    ) {
      await appendAccidentReportDraftIfMissing(env, pageId);
      await resetAccidentReportReviewFlags(env, pageId);
    }

    if (
      fromStatus === ACCIDENT_STATUS.inProgress &&
      toStatus === ACCIDENT_STATUS.complete
    ) {
      const completionGate = await getAccidentSendReadyGateState(env, pageId);
      if (!completionGate.ready) {
        return jsonResponse(
          {
            ok: false,
            message: buildCompletionBlockedMessage(completionGate)
          },
          409
        );
      }
    }

    await updateAccidentPageStatus(env, { pageId, status: toStatus });

    return jsonResponse(
      {
        ok: true,
        status: toStatus
      },
      200
    );
  } catch (error) {
    if (reportNotionOwnershipError("admin_accident_status", error)) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        409
      );
    }

    return jsonResponse(
      {
        ok: false,
        message: CUSTOMER_FAILURE_MESSAGE
      },
      500
    );
  }
}
