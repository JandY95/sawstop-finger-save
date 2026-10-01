import {
  ADMIN_ACCIDENT_SEARCH_ROUTE,
  ADMIN_ACCIDENT_STATUS_UPDATE_ROUTE,
  ADMIN_REVIEW_CHECKBOXES_ROUTE,
  ADMIN_ATTACHMENT_LIST_ROUTE,
  ADMIN_ATTACHMENT_FIFO_PROCESS_ROUTE,
  ADMIN_ATTACHMENT_RESTORE_ROUTE,
  ADMIN_ATTACHMENT_TRASH_ROUTE,
  ADMIN_ATTACHMENT_TYPE_UPDATE_ROUTE,
  ADMIN_LOGIN_ROUTE,
  ADMIN_LOGOUT_ROUTE,
  ADMIN_MANUAL_SEND_PACKAGE_ROUTE,
  ADMIN_MANUAL_SEND_RESULT_ROUTE,
  ADMIN_PAGE_ROUTE,
  ADMIN_REPORT_ROUTE,
  ADMIN_REPORT_PDF_ROUTE,
  ADMIN_UPLOAD_ROUTE,
  ATTACHMENT_UPLOAD_STATUS,
  CUSTOMER_ATTACHMENT_FIELD_NAME,
  CUSTOMER_ATTACHMENT_MAX_COUNT,
  CUSTOMER_FAILURE_MESSAGE,
  CUSTOMER_SUCCESS_MESSAGE,
  CUSTOMER_TURNSTILE_UNAVAILABLE_MESSAGE,
  SUBMIT_ROUTE
} from "./constants";
import {
  validateAttachmentContent,
  validateAttachmentMetadata,
  type AttachmentValidationFailureReason
} from "./attachment-validation";
import { renderCustomerPage } from "./render";
import {
  logStructuredError,
  type StructuredErrorStage
} from "./error-logging";
import type { ExternalRetryDependencies } from "./external-retry";
import {
  handleAdminLogin,
  handleAdminLogout,
  isAdminAuthenticated,
  requireAdminApiAuth
} from "./admin/auth";
import { renderAdminPage } from "./admin/render";
import { handleAdminAttachmentList } from "./admin/list-attachments";
import {
  ADMIN_ATTACHMENT_READ_ROUTE,
  handleAdminAttachmentRead
} from "./admin/read-attachment";
import { handleAdminMoveAttachmentToTrash } from "./admin/move-attachment-to-trash";
import { handleAdminProcessFifoTrash } from "./admin/process-fifo-trash";
import { handleAdminRestoreAttachment } from "./admin/restore-attachment";
import { handleAdminAccidentSearch } from "./admin/search";
import { handleAdminUpdateAccidentStatus } from "./admin/update-accident-status";
import { handleAdminReviewCheckboxes } from "./admin/review-checkboxes";
import { handleAdminUpdateAttachmentType } from "./admin/update-attachment-type";
import { renderAdminReportPage } from "./admin/report";
import { renderAdminReportPdf } from "./admin/report-pdf";
import {
  handleAdminManualSendResult,
  renderAdminManualSendPackagePage
} from "./admin/manual-send-package";
import { handleCoordinatedAdminUpload as handleAdminUpload } from "./admin/upload";
import { consumeAttachmentBatch } from "./consumer";
import { buildAccidentDbProperties } from "./mapper";
import { normalizeSubmitFormData } from "./normalize";
import { createAccidentPage } from "./notion";
import {
  buildSubmitAttachmentPayload,
  enqueueSubmitAttachmentPayload,
  markAccidentAttachmentUploadStatus
} from "./queue";
import { buildReceiptNumber } from "./receipt";
import { uploadAttachmentToTmpR2 } from "./r2";
import { verifyTurnstileSubmit, TURNSTILE_RESPONSE_FIELD_NAME } from "./turnstile";
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

export { AdminAuthLock } from "./admin/auth-lock";
export { AdminUploadCoordinator } from "./admin/upload";

interface PreparedSubmitAttachmentFile {
  name: string;
  type: string;
  size: number;
  bytes: ArrayBuffer;
}

interface SubmitAttachmentRejection {
  index: number;
  fileName: string;
  message: string;
}

type CustomerSubmitResponseBody =
  | CustomerSubmitSuccessResponse
  | (CustomerSubmitFailureResponse & {
      rejectedAttachments?: SubmitAttachmentRejection[];
    });

function jsonResponse(
  body: CustomerSubmitResponseBody,
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
    .filter((file) => file.name.length > 0 || file.size > 0);
}

function buildSubmitAttachmentRejection(
  file: File,
  index: number,
  reason: AttachmentValidationFailureReason | "too_many_files"
): SubmitAttachmentRejection {
  const fileName = file.name || `파일 ${index + 1}`;

  if (reason === "unsupported_extension") {
    return {
      index,
      fileName,
      message: `${fileName}: 이미지 파일만 업로드할 수 있습니다.`
    };
  }
  if (reason === "empty_file") {
    return {
      index,
      fileName,
      message: `${fileName}: 비어 있는 파일은 업로드할 수 없습니다.`
    };
  }
  if (reason === "file_too_large") {
    return {
      index,
      fileName,
      message: `${fileName}: 각 파일은 10MB 이하만 업로드할 수 있습니다.`
    };
  }
  if (reason === "too_many_files") {
    return {
      index,
      fileName,
      message: `${fileName}: 사진은 최대 4장까지 첨부할 수 있습니다.`
    };
  }

  return {
    index,
    fileName,
    message: `${fileName}: 파일 이름과 형식이 일치하지 않습니다.`
  };
}

async function partitionSubmitAttachmentFiles(files: File[]) {
  const acceptedFiles: PreparedSubmitAttachmentFile[] = [];
  const rejectedAttachments: SubmitAttachmentRejection[] = [];

  for (const [index, file] of files.entries()) {
    const metadataResult = validateAttachmentMetadata({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size
    });
    if (metadataResult.ok === false) {
      rejectedAttachments.push(
        buildSubmitAttachmentRejection(file, index, metadataResult.reason)
      );
      continue;
    }

    if (acceptedFiles.length >= CUSTOMER_ATTACHMENT_MAX_COUNT) {
      rejectedAttachments.push(
        buildSubmitAttachmentRejection(file, index, "too_many_files")
      );
      continue;
    }

    const bytes = await file.arrayBuffer();
    const contentResult = validateAttachmentContent(file.name, bytes);
    if (contentResult.ok === false) {
      rejectedAttachments.push(
        buildSubmitAttachmentRejection(file, index, contentResult.reason)
      );
      continue;
    }

    acceptedFiles.push({
      name: file.name,
      type: file.type,
      size: file.size,
      bytes
    });
  }

  return {
    acceptedFiles,
    rejectedAttachments
  };
}

async function uploadSubmitAttachmentsToTmpR2(
  env: WorkerEnv,
  receiptNumber: string,
  pageId: string,
  files: PreparedSubmitAttachmentFile[],
  retryDependencies?: ExternalRetryDependencies
): Promise<SubmitAttachmentReference[]> {
  const uploadResults = await Promise.allSettled(
    files.map(async (file, index) => {
      const seq = index + 1;
      const { tmpKey } = await uploadAttachmentToTmpR2(env, {
        pageId,
        seq,
        file
      }, retryDependencies);

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

  for (const [index, uploadResult] of uploadResults.entries()) {
    if (uploadResult.status === "fulfilled") {
      uploadedReferences.push(uploadResult.value);
      continue;
    }

    logStructuredError({
      receiptNumber,
      route: SUBMIT_ROUTE,
      stage: "submit_tmp_r2_upload",
      reasonCode: "tmp_r2_upload_failed",
      error: uploadResult.reason,
      context: {
        fileCount: files.length,
        failureCount: 1,
        failedSeqs: [index + 1]
      }
    });
  }

  return uploadedReferences;
}

async function processSubmitAttachments(
  env: WorkerEnv,
  receiptNumber: string,
  pageId: string,
  attachmentFiles: PreparedSubmitAttachmentFile[],
  retryDependencies?: ExternalRetryDependencies
) {
  const attachmentReferences = await uploadSubmitAttachmentsToTmpR2(
    env,
    receiptNumber,
    pageId,
    attachmentFiles,
    retryDependencies
  );

  if (attachmentReferences.length === 0) {
    try {
      await markAccidentAttachmentUploadStatus(
        env,
        pageId,
        ATTACHMENT_UPLOAD_STATUS.failure
      );
    } catch (error) {
      logStructuredError({
        receiptNumber,
        route: SUBMIT_ROUTE,
        stage: "submit_attachment_status_write",
        reasonCode: "attachment_status_write_failed",
        error,
        context: {
          fileCount: attachmentFiles.length,
          failureCount: attachmentFiles.length
        }
      });
    }
    return;
  }

  const payload = buildSubmitAttachmentPayload(
    receiptNumber,
    pageId,
    attachmentFiles.length,
    attachmentReferences
  );

  try {
    await enqueueSubmitAttachmentPayload(env, payload, retryDependencies);
  } catch (error) {
    logStructuredError({
      receiptNumber,
      route: SUBMIT_ROUTE,
      stage: "submit_queue_enqueue",
      reasonCode: "queue_enqueue_failed",
      error,
      context: {
        fileCount: attachmentFiles.length,
        failureCount: attachmentFiles.length
      }
    });
    try {
      await markAccidentAttachmentUploadStatus(
        env,
        pageId,
        ATTACHMENT_UPLOAD_STATUS.failure
      );
    } catch (statusError) {
      logStructuredError({
        receiptNumber,
        route: SUBMIT_ROUTE,
        stage: "submit_attachment_status_write",
        reasonCode: "attachment_status_write_failed",
        error: statusError,
        context: {
          fileCount: attachmentFiles.length,
          failureCount: attachmentFiles.length
        }
      });
    }
  }
}

export async function handleSubmit(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerExecutionContext,
  retryDependencies?: ExternalRetryDependencies
) {
  let receiptNumber: string | null = null;
  let errorStage: StructuredErrorStage = "submit_form_parse";
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
    errorStage = "submit_turnstile_verify";
    const turnstileValid = await verifyTurnstileSubmit(
      env,
      formData.get(TURNSTILE_RESPONSE_FIELD_NAME),
      request
    );

    if (!turnstileValid) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_TURNSTILE_UNAVAILABLE_MESSAGE
        },
        400
      );
    }

    errorStage = "submit_attachment_validate";
    const attachmentFiles = getSubmitAttachmentFiles(formData);
    const attachmentResult = await partitionSubmitAttachmentFiles(attachmentFiles);

    if (attachmentResult.rejectedAttachments.length > 0) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE,
          rejectedAttachments: attachmentResult.rejectedAttachments
        },
        400
      );
    }

    errorStage = "submit_input_validate";
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

    errorStage = "submit_receipt_build";
    receiptNumber = buildReceiptNumber(normalized.phone);
    const properties = buildAccidentDbProperties({
      receiptNumber,
      normalized
    });

    errorStage = "submit_notion_create";
    const page = await createAccidentPage(env, { properties });

    if (attachmentResult.acceptedFiles.length > 0) {
      ctx.waitUntil(
        processSubmitAttachments(
          env,
          receiptNumber,
          page.id,
          attachmentResult.acceptedFiles,
          retryDependencies
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
  } catch (error) {
    logStructuredError({
      receiptNumber,
      route: SUBMIT_ROUTE,
      stage: errorStage,
      reasonCode: "submit_failed",
      error
    });
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

    if (request.method === "GET" && url.pathname === "/") {
      return renderCustomerPage({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });
    }

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

    if (request.method === "GET" && url.pathname === ADMIN_REPORT_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return renderAdminReportPage(request, env);
    }

    if (request.method === "GET" && url.pathname === ADMIN_REPORT_PDF_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return renderAdminReportPdf(request, env);
    }

    if (
      request.method === "GET" &&
      url.pathname === ADMIN_MANUAL_SEND_PACKAGE_ROUTE
    ) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return renderAdminManualSendPackagePage(request, env);
    }

    if (
      request.method === "POST" &&
      url.pathname === ADMIN_MANUAL_SEND_RESULT_ROUTE
    ) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminManualSendResult(request, env);
    }

    if (request.method === "GET" && url.pathname === ADMIN_ACCIDENT_SEARCH_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminAccidentSearch(request, env);
    }

    if (request.method === "POST" && url.pathname === ADMIN_ACCIDENT_STATUS_UPDATE_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminUpdateAccidentStatus(request, env);
    }

    if (
      (request.method === "GET" || request.method === "POST") &&
      url.pathname === ADMIN_REVIEW_CHECKBOXES_ROUTE
    ) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminReviewCheckboxes(request, env);
    }

    if (request.method === "GET" && url.pathname === ADMIN_ATTACHMENT_LIST_ROUTE) {
      const unauthorizedResponse = await requireAdminApiAuth(request, env);
      if (unauthorizedResponse) {
        return unauthorizedResponse;
      }

      return handleAdminAttachmentList(request, env);
    }

    if (request.method === "GET" && url.pathname === ADMIN_ATTACHMENT_READ_ROUTE) {
      return handleAdminAttachmentRead(request, env);
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
