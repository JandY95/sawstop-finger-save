import {
  ATTACHMENT_DELETE_REASON_OPTIONS,
  CUSTOMER_FAILURE_MESSAGE
} from "../constants.ts";
import {
  moveAttachmentPageToTrashWithTimestamp,
  recalculateAccidentHasFingerPhoto,
  resetAccidentAttachmentFinalCheck,
  updatePageProperties
} from "../notion.ts";
import type {
  AdminMoveAttachmentToTrashFailureResponse,
  AdminMoveAttachmentToTrashRequest,
  AdminMoveAttachmentToTrashSuccessResponse,
  WorkerEnv
} from "../types.ts";

function isAllowedDeletionReason(value: string) {
  return ATTACHMENT_DELETE_REASON_OPTIONS.includes(
    value as (typeof ATTACHMENT_DELETE_REASON_OPTIONS)[number]
  );
}

function jsonResponse(
  body:
    | AdminMoveAttachmentToTrashSuccessResponse
    | AdminMoveAttachmentToTrashFailureResponse,
  status: number
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function handleAdminMoveAttachmentToTrash(
  request: Request,
  env: WorkerEnv
) {
  try {
    const body =
      (await request.json()) as Partial<AdminMoveAttachmentToTrashRequest>;
    const attachmentPageId = String(body.attachmentPageId ?? "").trim();
    const pageId = String(body.pageId ?? "").trim();
    const deletionReason = String(body.deletionReason ?? "").trim();

    if (
      attachmentPageId.length === 0 ||
      pageId.length === 0 ||
      !isAllowedDeletionReason(deletionReason)
    ) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }

    await moveAttachmentPageToTrashWithTimestamp(env, {
      attachmentPageId,
      deletionReason
    });

    await updatePageProperties(env, {
      pageId,
      properties: resetAccidentAttachmentFinalCheck()
    });

    await recalculateAccidentHasFingerPhoto(env, pageId);

    return jsonResponse(
      {
        ok: true
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
