import {
  ADMIN_ACCIDENT_SEARCH_ROUTE,
  ADMIN_ATTACHMENT_LIST_ROUTE,
  ADMIN_ATTACHMENT_FIFO_PROCESS_ROUTE,
  ADMIN_ATTACHMENT_RESTORE_ROUTE,
  ADMIN_ATTACHMENT_TRASH_ROUTE,
  ADMIN_ATTACHMENT_TYPE_UPDATE_ROUTE,
  ADMIN_LOGIN_ROUTE,
  ADMIN_LOGOUT_ROUTE,
  ADMIN_PAGE_ROUTE,
  ADMIN_UPLOAD_ROUTE,
  ATTACHMENT_UPLOAD_STATUS,
  CUSTOMER_ATTACHMENT_FIELD_NAME,
  CUSTOMER_FAILURE_MESSAGE,
  CUSTOMER_SUCCESS_MESSAGE,
  SUBMIT_ROUTE
} from "./constants";
import {
  handleAdminLogin,
  handleAdminLogout,
  isAdminAuthenticated,
  requireAdminApiAuth
} from "./admin/auth";
import { renderAdminPage } from "./admin/render";
import { handleAdminAttachmentList } from "./admin/list-attachments";
import { handleAdminMoveAttachmentToTrash } from "./admin/move-attachment-to-trash";
import { handleAdminProcessFifoTrash } from "./admin/process-fifo-trash";
import { handleAdminRestoreAttachment } from "./admin/restore-attachment";
import { handleAdminAccidentSearch } from "./admin/search";
import { handleAdminUpdateAttachmentType } from "./admin/update-attachment-type";
import { handleAdminUpload } from "./admin/upload";
import { consumeAttachmentBatch } from "./consumer";
import { buildAccidentDbProperties } from "./mapper";
import { normalizeSubmitFormData } from "./normalize";
import { createAccidentPage, saveAccidentPageDefaultBody } from "./notion";
import {
  buildSubmitAttachmentPayload,
  enqueueSubmitAttachmentPayload,
  markAccidentAttachmentUploadStatus
} from "./queue";
import { buildReceiptNumber } from "./receipt";
import { uploadAttachmentToTmpR2 } from "./r2";
import { validateSubmitInput } from "./validate";
import type {
  CustomerSubmitFailureResponse,
  CustomerSubmitSuccessResponse,
  MessageBatch,
  SubmitAttachmentPayload,
  SubmitAttachmentReference,
  WorkerEnv,
  WorkerExecutionContext
} from "./types";

interface PreparedSubmitAttachmentFile {
  name: string;
  type: string;
  size: number;
  bytes: ArrayBuffer;
}

function jsonResponse(
  body: CustomerSubmitSuccessResponse | CustomerSubmitFailureResponse,
  status: number
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function getSubmitAttachmentFiles(formData: FormData) {
  return formData
    .getAll(CUSTOMER_ATTACHMENT_FIELD_NAME)
    .filter(
      (value): value is File => typeof File !== "undefined" && value instanceof File
    )
    .filter((file) => file.size > 0);
}

async function uploadSubmitAttachmentsToTmpR2(
  env: WorkerEnv,
  receiptNumber: string,
  files: PreparedSubmitAttachmentFile[]
): Promise<SubmitAttachmentReference[]> {
  const uploadResults = await Promise.allSettled(
    files.map(async (file, index) => {
      const seq = index + 1;
      const { tmpKey } = await uploadAttachmentToTmpR2(env, {
        receiptNumber,
        seq,
        file
      });

      return {
        seq,
        tmpKey,
        originalFileName: file.name,
        contentType: file.type,
        sizeBytes: file.size
      };
    })
  );

  const uploadedReferences: SubmitAttachmentReference[] = [];

  for (const uploadResult of uploadResults) {
    if (uploadResult.status === "fulfilled") {
      uploadedReferences.push(uploadResult.value);
      continue;
    }

    console.error("Failed to upload attachment to tmp R2", uploadResult.reason);
  }

  return uploadedReferences;
}

async function processSubmitAttachments(
  env: WorkerEnv,
  receiptNumber: string,
  pageId: string,
  attachmentFiles: PreparedSubmitAttachmentFile[]
) {
  const attachmentReferences = await uploadSubmitAttachmentsToTmpR2(
    env,
    receiptNumber,
    attachmentFiles
  );

  if (attachmentReferences.length === 0) {
    await markAccidentAttachmentUploadStatus(
      env,
      pageId,
      ATTACHMENT_UPLOAD_STATUS.failure
    );
    return;
  }

  const payload = buildSubmitAttachmentPayload(
    receiptNumber,
    pageId,
    attachmentFiles.length,
    attachmentReferences
  );

  try {
    await enqueueSubmitAttachmentPayload(env, payload);
  } catch (error) {
    console.error("Failed to enqueue attachment payload", error);
    await markAccidentAttachmentUploadStatus(
      env,
      pageId,
      ATTACHMENT_UPLOAD_STATUS.failure
    );
  }
}

async function prepareSubmitAttachmentFiles(files: File[]) {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      bytes: await file.arrayBuffer()
    }))
  );
}

async function handleSubmit(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerExecutionContext
) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(
      {
        ok: false,
        message: CUSTOMER_FAILURE_MESSAGE
      },
      400
    );
  }

  try {
    const formData = await request.formData();
    const attachmentFiles = getSubmitAttachmentFiles(formData);
    const preparedAttachmentFiles = await prepareSubmitAttachmentFiles(
      attachmentFiles
    );
    const normalized = normalizeSubmitFormData(formData);
    const validation = validateSubmitInput(normalized);

    if (!validation.isValid) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }

    const receiptNumber = buildReceiptNumber(normalized.phone);
    const properties = buildAccidentDbProperties({
      receiptNumber,
      normalized
    });

    const page = await createAccidentPage(env, { properties });
    await saveAccidentPageDefaultBody(env, { pageId: page.id });

    if (preparedAttachmentFiles.length > 0) {
      ctx.waitUntil(
        processSubmitAttachments(
          env,
          receiptNumber,
          page.id,
          preparedAttachmentFiles
        )
      );
    }

    return jsonResponse(
      {
        ok: true,
        receiptNumber,
        message: CUSTOMER_SUCCESS_MESSAGE
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

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerExecutionContext) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === SUBMIT_ROUTE) {
      return handleSubmit(request, env, ctx);
    }

    if (request.method === "GET" && url.pathname === ADMIN_PAGE_ROUTE) {
      const authenticated = await isAdminAuthenticated(request, env);
      return renderAdminPage(request, { authenticated });
    }

    if (request.method === "POST" && url.pathname === ADMIN_LOGIN_ROUTE) {
      return handleAdminLogin(request, env);
    }

    if (request.method === "POST" && url.pathname === ADMIN_LOGOUT_ROUTE) {
      return handleAdminLogout(request);
    }

    if (request.method === "GET" && url.pathname === ADMIN_ACCIDENT_SEARCH_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminAccidentSearch(request, env);
    }

    if (request.method === "GET" && url.pathname === ADMIN_ATTACHMENT_LIST_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminAttachmentList(request, env);
    }

    if (request.method === "POST" && url.pathname === ADMIN_UPLOAD_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminUpload(request, env);
    }

    if (request.method === "POST" && url.pathname === ADMIN_ATTACHMENT_TYPE_UPDATE_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminUpdateAttachmentType(request, env);
    }

    if (request.method === "POST" && url.pathname === ADMIN_ATTACHMENT_TRASH_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminMoveAttachmentToTrash(request, env);
    }

    if (request.method === "POST" && url.pathname === ADMIN_ATTACHMENT_RESTORE_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminRestoreAttachment(request, env);
    }

    if (request.method === "POST" && url.pathname === ADMIN_ATTACHMENT_FIFO_PROCESS_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminProcessFifoTrash(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },

  async queue(batch: MessageBatch<SubmitAttachmentPayload>, env: WorkerEnv) {
    await consumeAttachmentBatch(batch, env);
  }
};
