import {
  ACCIDENT_DB_PROPERTY_NAMES,
  ATTACHMENT_TYPE_OPTIONS,
  ATTACHMENT_UPLOAD_STATUS,
  CUSTOMER_ATTACHMENT_MAX_COUNT,
  CUSTOMER_FAILURE_MESSAGE
} from "../constants.ts";
import {
  validateAttachmentContent,
  validateAttachmentMetadata,
  type AttachmentValidationFailureReason
} from "../attachment-validation.ts";
import {
  createAttachmentPageRecord,
  getAccidentPageReceiptNumber,
  getNextAttachmentDisplayOrder,
  NotionPageNotFoundError,
  recalculateAccidentHasFingerPhoto,
  reportNotionOwnershipError,
  resetAccidentAttachmentFinalCheck,
  updatePageProperties
} from "../notion.ts";
import {
  buildAdminFinalAttachmentKey,
  confirmAdminAttachmentPreservedForRecovery,
  uploadAdminAttachmentToFinalR2
} from "../r2.ts";
import {
  logStructuredError,
  type StructuredErrorStage
} from "../error-logging.ts";
import type {
  AdminUploadFailureResponse,
  AdminUploadFileResult,
  AdminUploadStoredFile,
  AdminUploadSuccessResponse,
  DurableObjectStateLike,
  WorkerEnv
} from "../types.ts";

export const ADMIN_UPLOAD_IDEMPOTENCY_HEADER = "Idempotency-Key";
export const ADMIN_UPLOAD_PAGE_ID_HEADER = "X-SawStop-Accident-Page-Id";

const ADMIN_UPLOAD_REQUEST_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const ADMIN_UPLOAD_PAGE_ID_PATTERN = /^[A-Za-z0-9-]{1,128}$/;
const ADMIN_UPLOAD_MAX_RESERVED_ORDER_STORAGE_KEY = "max-reserved-display-order";
const ADMIN_UPLOAD_REQUEST_STORAGE_PREFIX = "request:";

interface AdminUploadReservation {
  displayOrder: number;
  finalKey: string;
}

type AdminUploadRecoveryFileState = "reserved" | "r2_preserved" | "notion_recorded";
type AdminUploadRecoveryFailure = "r2_write" | "notion_create";
type AdminUploadRecoveryPreservation = "not_required" | "verified" | "unverified";

interface AdminUploadRecoveryFileRecord extends AdminUploadReservation {
  state: AdminUploadRecoveryFileState;
  failure: AdminUploadRecoveryFailure | null;
  preservation: AdminUploadRecoveryPreservation;
}

interface AdminUploadRecoveryRecord {
  policy: "preserve_and_retry";
  requestFailure: "status_update" | null;
  files: AdminUploadRecoveryFileRecord[];
}

interface AdminUploadRequestRecord {
  fingerprint: string;
  reservations?: AdminUploadReservation[];
  recovery?: AdminUploadRecoveryRecord;
  completedResponse?: {
    status: number;
    body: string;
  };
}

interface AdminUploadProcessOptions {
  reserveFiles?: (input: {
    files: File[];
    pageId: string;
    startingDisplayOrder: number;
  }) => Promise<AdminUploadReservation[]>;
  recordFileRecovery?: (input: {
    index: number;
    state: AdminUploadRecoveryFileState;
    failure: AdminUploadRecoveryFailure | null;
    preservation: AdminUploadRecoveryPreservation;
  }) => Promise<void>;
  recordRequestFailure?: (failure: "status_update" | null) => Promise<void>;
}

function jsonResponse(
  body: AdminUploadSuccessResponse | AdminUploadFailureResponse,
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

type AdminUploadValidationFailureReason =
  | AttachmentValidationFailureReason
  | "too_many_files";

function buildAdminUploadValidationResult(
  file: File,
  index: number,
  reason: AdminUploadValidationFailureReason
): AdminUploadFileResult {
  const originalFileName = file.name || `파일 ${index + 1}`;
  let message: string;

  if (reason === "unsupported_extension") {
    message = `${originalFileName}: 이미지 파일만 업로드할 수 있습니다.`;
  } else if (reason === "empty_file") {
    message = `${originalFileName}: 비어 있는 파일은 업로드할 수 없습니다.`;
  } else if (reason === "file_too_large") {
    message = `${originalFileName}: 각 파일은 10MB 이하만 업로드할 수 있습니다.`;
  } else if (reason === "too_many_files") {
    message = `${originalFileName}: 사진은 최대 4장까지 업로드할 수 있습니다.`;
  } else if (reason === "signature_mismatch") {
    message = `${originalFileName}: 파일 이름과 실제 내용이 일치하지 않습니다.`;
  } else {
    message = `${originalFileName}: 파일 이름과 형식이 일치하지 않습니다.`;
  }

  return {
    originalFileName,
    uploadedToR2: false,
    attachmentPageCreated: false,
    message
  };
}

async function validateAdminUploadFiles(files: File[]) {
  if (files.length > CUSTOMER_ATTACHMENT_MAX_COUNT) {
    return files
      .slice(CUSTOMER_ATTACHMENT_MAX_COUNT)
      .map((file, offset) =>
        buildAdminUploadValidationResult(
          file,
          CUSTOMER_ATTACHMENT_MAX_COUNT + offset,
          "too_many_files"
        )
      );
  }

  const metadataFailures: AdminUploadFileResult[] = [];
  for (const [index, file] of files.entries()) {
    const result = validateAttachmentMetadata({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size
    });
    if (result.ok === false) {
      metadataFailures.push(
        buildAdminUploadValidationResult(file, index, result.reason)
      );
    }
  }

  if (metadataFailures.length > 0) {
    return metadataFailures;
  }

  const contentFailures: AdminUploadFileResult[] = [];
  for (const [index, file] of files.entries()) {
    const result = validateAttachmentContent(file.name, await file.arrayBuffer());
    if (result.ok === false) {
      contentFailures.push(
        buildAdminUploadValidationResult(file, index, result.reason)
      );
    }
  }

  return contentFailures;
}

function buildAdminAttachmentUploadStatus(
  totalFileCount: number,
  successCount: number
) {
  if (totalFileCount <= 0) {
    return ATTACHMENT_UPLOAD_STATUS.complete;
  }

  if (successCount <= 0) {
    return ATTACHMENT_UPLOAD_STATUS.failure;
  }

  if (successCount < totalFileCount) {
    return ATTACHMENT_UPLOAD_STATUS.partialFailure;
  }

  return ATTACHMENT_UPLOAD_STATUS.complete;
}

function getAdminUploadFiles(formData: FormData) {
  return formData
    .getAll("files")
    .filter(
      (value): value is File => typeof File !== "undefined" && value instanceof File
    )
    .filter((file) => file.name.length > 0 || file.size > 0);
}

function isValidAdminUploadRequestKey(value: string) {
  return ADMIN_UPLOAD_REQUEST_KEY_PATTERN.test(value);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource)
    )
  );
}

async function readAdminUploadRequestIdentity(request: Request) {
  const formData = await request.clone().formData();
  const pageId = String(formData.get("pageId") ?? "").trim();
  const attachmentType = String(formData.get("attachmentType") ?? "").trim();
  const files = getAdminUploadFiles(formData);
  const fileIdentities = [] as Array<{
    name: string;
    type: string;
    size: number;
    sha256: string;
  }>;

  for (const file of files) {
    fileIdentities.push({
      name: file.name,
      type: file.type,
      size: file.size,
      sha256: await sha256Hex(await file.arrayBuffer())
    });
  }

  return {
    pageId,
    fingerprint: await sha256Hex(
      new TextEncoder().encode(
        JSON.stringify({
          pageId,
          attachmentType,
          files: fileIdentities
        })
      )
    )
  };
}

function cachedAdminUploadResponse(record: AdminUploadRequestRecord) {
  if (!record.completedResponse) {
    return null;
  }

  return new Response(record.completedResponse.body, {
    status: record.completedResponse.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function handleAdminUpload(
  request: Request,
  env: WorkerEnv,
  options: AdminUploadProcessOptions = {}
) {
  let receiptNumber: string | null = null;
  let errorStage: StructuredErrorStage = "admin_request_parse";
  // Admin API authentication is enforced in the route dispatcher before this handler runs.
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
    const pageId = String(formData.get("pageId") ?? "").trim();
    const attachmentType = String(formData.get("attachmentType") ?? "").trim();
    const files = getAdminUploadFiles(formData);

    if (pageId.length === 0 || attachmentType.length === 0) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }

    if (!isAllowedAttachmentType(attachmentType)) {
      return jsonResponse(
        {
          ok: false,
          message: "첨부 유형을 다시 선택해 주세요."
        },
        400
      );
    }

    if (files.length === 0) {
      return jsonResponse(
        {
          ok: false,
          message: "업로드할 파일을 1개 이상 선택해 주세요."
        },
        400
      );
    }

    const validationFailures = await validateAdminUploadFiles(files);
    if (validationFailures.length > 0) {
      const countExceeded = files.length > CUSTOMER_ATTACHMENT_MAX_COUNT;
      return jsonResponse(
        {
          ok: false,
          message: countExceeded
            ? "한 번에 사진은 최대 4장까지 업로드할 수 있습니다. 정상 파일은 선택 상태로 유지됩니다."
            : "파일 내용을 확인해 주세요. 정상 파일은 선택 상태로 유지됩니다.",
          results: validationFailures
        },
        400
      );
    }

    errorStage = "admin_accident_read";
    receiptNumber = await getAccidentPageReceiptNumber(env, pageId);
    if (!receiptNumber) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        404
      );
    }

    errorStage = "admin_attachment_lookup";
    const startingDisplayOrder = await getNextAttachmentDisplayOrder(env, pageId);
    const reservations = options.reserveFiles
      ? await options.reserveFiles({
          files,
          pageId,
          startingDisplayOrder
        })
      : files.map((file, index) => {
          const displayOrder = startingDisplayOrder + index;
          return {
            displayOrder,
            finalKey: buildAdminFinalAttachmentKey(
              pageId,
              displayOrder,
              file.name
            )
          };
        });
    if (reservations.length !== files.length) {
      throw new Error("Admin upload reservation count mismatch");
    }
    const results: AdminUploadFileResult[] = [];
    let successCount = 0;

    for (const [index, file] of files.entries()) {
      const reservation = reservations[index];
      if (!reservation) {
        throw new Error("Admin upload reservation is missing");
      }
      const storedFile: AdminUploadStoredFile = {
        originalFileName: file.name,
        sizeBytes: file.size,
        finalKey: reservation.finalKey,
        displayOrder: reservation.displayOrder
      };
      let uploadedToR2 = false;

      let fileErrorStage: StructuredErrorStage = "admin_r2_write";
      try {
        const { finalKey } = await uploadAdminAttachmentToFinalR2(env, {
          pageId,
          seq: storedFile.displayOrder,
          file,
          finalKey: storedFile.finalKey
        });
        storedFile.finalKey = finalKey;
        uploadedToR2 = true;
        await options.recordFileRecovery?.({
          index,
          state: "r2_preserved",
          failure: null,
          preservation: "verified"
        });

        fileErrorStage = "admin_notion_attachment_create";
        await createAttachmentPageRecord(env, {
          pageId,
          attachmentType,
          fileName: storedFile.originalFileName,
          r2Key: storedFile.finalKey,
          displayOrder: storedFile.displayOrder
        });
        await options.recordFileRecovery?.({
          index,
          state: "notion_recorded",
          failure: null,
          preservation: "verified"
        });
        results.push({
          originalFileName: storedFile.originalFileName,
          uploadedToR2: true,
          attachmentPageCreated: true
        });
        successCount += 1;
      } catch (error) {
        logStructuredError({
          receiptNumber,
          route: "/admin/upload",
          stage: fileErrorStage,
          reasonCode: "admin_file_upload_failed",
          error,
          context: {
            fileCount: files.length,
            failureCount: 1,
            failedSeqs: [storedFile.displayOrder]
          }
        });
        let preservation: AdminUploadRecoveryPreservation = "not_required";
        if (uploadedToR2) {
          try {
            preservation = await confirmAdminAttachmentPreservedForRecovery(env, {
              pageId,
              finalKey: storedFile.finalKey
            })
              ? "verified"
              : "unverified";
          } catch {
            preservation = "unverified";
          }
        }
        await options.recordFileRecovery?.({
          index,
          state: uploadedToR2 ? "r2_preserved" : "reserved",
          failure: uploadedToR2 ? "notion_create" : "r2_write",
          preservation
        });
        results.push({
          originalFileName: file.name,
          uploadedToR2,
          attachmentPageCreated: false,
          message:
            error instanceof Error ? error.message : "Attachment page create failed"
        });
      }
    }

    const failureCount = results.length - successCount;
    const attachmentUploadStatus = buildAdminAttachmentUploadStatus(
      results.length,
      successCount
    );

    errorStage = "admin_status_write";
    try {
      await updatePageProperties(env, {
        pageId,
        properties: {
          [ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus]: {
            select: { name: attachmentUploadStatus }
          },
          ...(successCount > 0 ? resetAccidentAttachmentFinalCheck() : {})
        }
      });

      if (successCount > 0) {
        await recalculateAccidentHasFingerPhoto(env, pageId);
      }
      await options.recordRequestFailure?.(null);
    } catch (error) {
      await options.recordRequestFailure?.("status_update");
      throw error;
    }

    if (successCount <= 0) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE,
          results
        },
        500
      );
    }

    return jsonResponse(
      {
        ok: true,
        pageId,
        attachmentType,
        totalFileCount: results.length,
        successCount,
        failureCount,
        results
      },
      failureCount > 0 ? 207 : 200
    );
  } catch (error) {
    logStructuredError({
      receiptNumber,
      route: "/admin/upload",
      stage: errorStage,
      reasonCode: "admin_upload_failed",
      error
    });
    if (error instanceof NotionPageNotFoundError) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        404
      );
    }

    if (reportNotionOwnershipError("admin_upload", error)) {
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

export class AdminUploadCoordinator {
  private readonly state: DurableObjectStateLike;
  private readonly env: WorkerEnv;
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(state: DurableObjectStateLike, env: WorkerEnv) {
    this.state = state;
    this.env = env;
  }

  fetch(request: Request) {
    const responsePromise = this.requestQueue.then(() => this.process(request));
    this.requestQueue = responsePromise.then(
      () => undefined,
      () => undefined
    );
    return responsePromise;
  }

  private async process(request: Request) {
    const idempotencyKey =
      request.headers.get(ADMIN_UPLOAD_IDEMPOTENCY_HEADER)?.trim() ?? "";
    if (!isValidAdminUploadRequestKey(idempotencyKey)) {
      return jsonResponse(
        {
          ok: false,
          message: "업로드 요청 키가 없거나 올바르지 않습니다."
        },
        400
      );
    }
    const routedPageId =
      request.headers.get(ADMIN_UPLOAD_PAGE_ID_HEADER)?.trim() ?? "";
    if (!ADMIN_UPLOAD_PAGE_ID_PATTERN.test(routedPageId)) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }

    let identity: Awaited<ReturnType<typeof readAdminUploadRequestIdentity>>;
    try {
      identity = await readAdminUploadRequestIdentity(request);
    } catch {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }
    if (identity.pageId !== routedPageId) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        409
      );
    }

    const requestStorageKey = `${ADMIN_UPLOAD_REQUEST_STORAGE_PREFIX}${idempotencyKey}`;
    let record = await this.state.storage.get<AdminUploadRequestRecord>(
      requestStorageKey
    );
    if (record && record.fingerprint !== identity.fingerprint) {
      return jsonResponse(
        {
          ok: false,
          message: "같은 업로드 요청 키의 요청 내용이 달라 업로드를 중단했습니다."
        },
        409
      );
    }

    const cachedResponse = record ? cachedAdminUploadResponse(record) : null;
    if (cachedResponse) {
      return cachedResponse;
    }

    record ??= {
      fingerprint: identity.fingerprint
    };
    await this.state.storage.put(requestStorageKey, record);

    const response = await handleAdminUpload(request, this.env, {
      reserveFiles: async ({ files, pageId, startingDisplayOrder }) => {
        if (record?.reservations) {
          if (record.reservations.length !== files.length) {
            throw new Error("Admin upload retry reservation count mismatch");
          }
          return record.reservations;
        }

        const maxReservedDisplayOrder =
          (await this.state.storage.get<number>(
            ADMIN_UPLOAD_MAX_RESERVED_ORDER_STORAGE_KEY
          )) ?? 0;
        const firstDisplayOrder = Math.max(
          startingDisplayOrder,
          maxReservedDisplayOrder + 1
        );
        const timestamp = Date.now();
        const reservations = files.map((file, index) => {
          const displayOrder = firstDisplayOrder + index;
          return {
            displayOrder,
            finalKey: buildAdminFinalAttachmentKey(
              pageId,
              displayOrder,
              file.name,
              timestamp
            )
          };
        });
        record = {
          ...record,
          reservations,
          recovery: {
            policy: "preserve_and_retry",
            requestFailure: null,
            files: reservations.map((reservation) => ({
              ...reservation,
              state: "reserved",
              failure: null,
              preservation: "not_required"
            }))
          }
        };
        const lastDisplayOrder =
          reservations.at(-1)?.displayOrder ?? maxReservedDisplayOrder;
        await this.state.storage.put({
          [requestStorageKey]: record,
          [ADMIN_UPLOAD_MAX_RESERVED_ORDER_STORAGE_KEY]: lastDisplayOrder
        });
        return reservations;
      },
      recordFileRecovery: async ({ index, state, failure, preservation }) => {
        const recoveryFile = record?.recovery?.files[index];
        if (!record?.recovery || !recoveryFile) {
          throw new Error("Admin upload recovery reservation is missing");
        }
        const files = record.recovery.files.map((file, fileIndex) =>
          fileIndex === index
            ? {
                ...file,
                state,
                failure,
                preservation
              }
            : file
        );
        record = {
          ...record,
          recovery: {
            ...record.recovery,
            files
          }
        };
        await this.state.storage.put(requestStorageKey, record);
      },
      recordRequestFailure: async (failure) => {
        if (!record?.recovery) {
          throw new Error("Admin upload recovery record is missing");
        }
        record = {
          ...record,
          recovery: {
            ...record.recovery,
            requestFailure: failure
          }
        };
        await this.state.storage.put(requestStorageKey, record);
      }
    });

    if (response.status === 200) {
      const responseBody = await response.clone().text();
      let responseJson: { ok?: unknown } | null = null;
      try {
        responseJson = JSON.parse(responseBody) as { ok?: unknown };
      } catch {
        responseJson = null;
      }
      if (responseJson?.ok === true) {
        record = {
          ...record,
          completedResponse: {
            status: response.status,
            body: responseBody
          }
        };
        await this.state.storage.put(requestStorageKey, record);
      }
    }

    return response;
  }
}

export async function handleCoordinatedAdminUpload(
  request: Request,
  env: WorkerEnv
) {
  const idempotencyKey =
    request.headers.get(ADMIN_UPLOAD_IDEMPOTENCY_HEADER)?.trim() ?? "";
  if (!isValidAdminUploadRequestKey(idempotencyKey)) {
    return jsonResponse(
      {
        ok: false,
        message: "업로드 요청 키가 없거나 올바르지 않습니다."
      },
      400
    );
  }

  const pageId = request.headers.get(ADMIN_UPLOAD_PAGE_ID_HEADER)?.trim() ?? "";
  if (!ADMIN_UPLOAD_PAGE_ID_PATTERN.test(pageId)) {
    return jsonResponse(
      {
        ok: false,
        message: CUSTOMER_FAILURE_MESSAGE
      },
      400
    );
  }

  const coordinatorId = env.ADMIN_UPLOAD_COORDINATOR.idFromName(pageId);
  return env.ADMIN_UPLOAD_COORDINATOR.get(coordinatorId).fetch(request);
}
