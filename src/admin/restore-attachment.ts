import { CUSTOMER_FAILURE_MESSAGE } from "../constants.ts";
import {
  assertAttachmentLifecycleTransition,
  recalculateAccidentHasFingerPhoto,
  reportAttachmentLifecycleError,
  reportNotionOwnershipError,
  resetAccidentAttachmentFinalCheck,
  restoreAttachmentPage,
  updatePageProperties
} from "../notion.ts";
import type {
  AdminRestoreAttachmentFailureResponse,
  AdminRestoreAttachmentRequest,
  AdminRestoreAttachmentSuccessResponse,
  WorkerEnv
} from "../types.ts";

function jsonResponse(
  body:
    | AdminRestoreAttachmentSuccessResponse
    | AdminRestoreAttachmentFailureResponse,
  status: number
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function handleAdminRestoreAttachment(
  request: Request,
  env: WorkerEnv
) {
  try {
    const body = (await request.json()) as Partial<AdminRestoreAttachmentRequest>;
    const attachmentPageId = String(body.attachmentPageId ?? "").trim();
    const pageId = String(body.pageId ?? "").trim();

    if (attachmentPageId.length === 0 || pageId.length === 0) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }

    await assertAttachmentLifecycleTransition(env, {
      pageId,
      attachmentPageId,
      action: "restore"
    });

    await restoreAttachmentPage(env, { attachmentPageId });

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
  } catch (error) {
    const lifecycleMessage = reportAttachmentLifecycleError(
      "admin_attachment_restore",
      error
    );
    if (lifecycleMessage) {
      return jsonResponse(
        {
          ok: false,
          message: lifecycleMessage
        },
        409
      );
    }

    if (reportNotionOwnershipError("admin_attachment_restore", error)) {
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
