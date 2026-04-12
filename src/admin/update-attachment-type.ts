import {
  ATTACHMENT_TYPE_OPTIONS,
  CUSTOMER_FAILURE_MESSAGE
} from "../constants.ts";
import {
  recalculateAccidentHasFingerPhoto,
  resetAccidentAttachmentFinalCheck,
  updateAttachmentPageType,
  updatePageProperties
} from "../notion.ts";
import type {
  AdminUpdateAttachmentTypeFailureResponse,
  AdminUpdateAttachmentTypeRequest,
  AdminUpdateAttachmentTypeSuccessResponse,
  WorkerEnv
} from "../types.ts";

function jsonResponse(
  body:
    | AdminUpdateAttachmentTypeSuccessResponse
    | AdminUpdateAttachmentTypeFailureResponse,
  status: number
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function isAllowedAttachmentType(value: string) {
  return ATTACHMENT_TYPE_OPTIONS.includes(
    value as (typeof ATTACHMENT_TYPE_OPTIONS)[number]
  );
}

export async function handleAdminUpdateAttachmentType(
  request: Request,
  env: WorkerEnv
) {
  try {
    const body =
      (await request.json()) as Partial<AdminUpdateAttachmentTypeRequest>;
    const attachmentPageId = String(body.attachmentPageId ?? "").trim();
    const pageId = String(body.pageId ?? "").trim();
    const attachmentType = String(body.attachmentType ?? "").trim();

    if (
      attachmentPageId.length === 0 ||
      pageId.length === 0 ||
      !isAllowedAttachmentType(attachmentType)
    ) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }

    await updateAttachmentPageType(env, {
      attachmentPageId,
      attachmentType
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
