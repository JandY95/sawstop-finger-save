import {
  ACCIDENT_DB_PROPERTY_NAMES,
  ATTACHMENT_TYPE_OPTIONS,
  ATTACHMENT_UPLOAD_STATUS,
  CUSTOMER_FAILURE_MESSAGE,
  NOTION_API_BASE_URL,
  NOTION_API_VERSION
} from "../constants.ts";
import {
  createAttachmentPageRecord,
  getNextAttachmentDisplayOrder,
  recalculateAccidentHasFingerPhoto,
  updatePageProperties
} from "../notion.ts";
import { uploadAdminAttachmentToFinalR2 } from "../r2.ts";
import type {
  AdminUploadFailureResponse,
  AdminUploadFileResult,
  AdminUploadStoredFile,
  AdminUploadSuccessResponse,
  WorkerEnv
} from "../types.ts";

type NotionAccidentPageResponse = {
  id?: string;
  properties?: Record<
    string,
    {
      title?: Array<{ plain_text?: string }>;
    }
  >;
};

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

function getRequiredEnv(env: WorkerEnv, name: "NOTION_TOKEN") {
  const value = env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getNotionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_API_VERSION
  };
}

function isAllowedAttachmentType(value: string) {
  return ATTACHMENT_TYPE_OPTIONS.includes(
    value as (typeof ATTACHMENT_TYPE_OPTIONS)[number]
  );
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
    .filter((file) => file.size > 0);
}

function readReceiptNumber(data: NotionAccidentPageResponse) {
  const items = data.properties?.[ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]?.title;
  if (!items || items.length === 0) {
    return null;
  }

  const text = items.map((item) => item.plain_text ?? "").join("").trim();
  return text.length > 0 ? text : null;
}

async function getAccidentPageReceiptNumber(env: WorkerEnv, pageId: string) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetch(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
    method: "GET",
    headers: getNotionHeaders(token)
  });

  if (response.status === 404 || response.status === 400) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Notion admin upload page lookup failed: ${response.status} ${await response.text()}`
    );
  }

  const data = (await response.json()) as NotionAccidentPageResponse;
  const receiptNumber = readReceiptNumber(data);

  if (!data.id || !receiptNumber) {
    return null;
  }

  return receiptNumber;
}

export async function handleAdminUpload(request: Request, env: WorkerEnv) {
  // TODO: 관리자 업로드 라우트에는 인증/잠금 로직이 필요하다.
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
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }

    if (files.length === 0) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        400
      );
    }

    const receiptNumber = await getAccidentPageReceiptNumber(env, pageId);
    if (!receiptNumber) {
      return jsonResponse(
        {
          ok: false,
          message: CUSTOMER_FAILURE_MESSAGE
        },
        404
      );
    }

    const startingDisplayOrder = await getNextAttachmentDisplayOrder(env, pageId);
    const results: AdminUploadFileResult[] = [];
    let successCount = 0;

    for (const [index, file] of files.entries()) {
      const storedFile: AdminUploadStoredFile = {
        originalFileName: file.name,
        sizeBytes: file.size,
        finalKey: "",
        displayOrder: startingDisplayOrder + index
      };

      try {
        const { finalKey } = await uploadAdminAttachmentToFinalR2(env, {
          receiptNumber,
          seq: storedFile.displayOrder,
          file
        });
        storedFile.finalKey = finalKey;

        await createAttachmentPageRecord(env, {
          pageId,
          receiptNumber,
          attachmentType,
          fileName: storedFile.originalFileName,
          r2Key: storedFile.finalKey,
          displayOrder: storedFile.displayOrder
        });
        results.push({
          originalFileName: storedFile.originalFileName,
          uploadedToR2: true,
          attachmentPageCreated: true
        });
        successCount += 1;
      } catch (error) {
        results.push({
          originalFileName: file.name,
          uploadedToR2: storedFile.finalKey.length > 0,
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

    await updatePageProperties(env, {
      pageId,
      properties: {
        [ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus]: {
          select: { name: attachmentUploadStatus }
        }
      }
    });

    await recalculateAccidentHasFingerPhoto(env, pageId);

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
