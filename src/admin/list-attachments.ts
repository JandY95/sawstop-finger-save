import { CUSTOMER_FAILURE_MESSAGE } from "../constants.ts";
import {
  assertAccidentPageOwnership,
  listAttachmentPagesByAccidentPageId,
  reportNotionOwnershipError
} from "../notion.ts";
import type {
  AdminAttachmentListFailureResponse,
  AdminAttachmentListRequest,
  AdminAttachmentListSuccessResponse,
  WorkerEnv
} from "../types.ts";

function jsonResponse(
  body: AdminAttachmentListSuccessResponse | AdminAttachmentListFailureResponse,
  status: number
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function buildListRequest(url: URL): AdminAttachmentListRequest {
  return {
    pageId: (url.searchParams.get("pageId") ?? "").trim()
  };
}

export async function handleAdminAttachmentList(request: Request, env: WorkerEnv) {
  const url = new URL(request.url);
  const { pageId } = buildListRequest(url);

  if (pageId.length === 0) {
    return jsonResponse(
      {
        ok: false,
        message: CUSTOMER_FAILURE_MESSAGE
      },
      400
    );
  }

  try {
    await assertAccidentPageOwnership(env, pageId);
    const attachments = await listAttachmentPagesByAccidentPageId(env, pageId);
    return jsonResponse(
      {
        ok: true,
        attachments
      },
      200
    );
  } catch (error) {
    if (reportNotionOwnershipError("admin_attachment_list", error)) {
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
