import { ACCIDENT_DB_PROPERTY_NAMES, ATTACHMENT_UPLOAD_STATUS } from "./constants";
import { updatePageProperties } from "./notion";
import type {
  SubmitAttachmentPayload,
  SubmitAttachmentReference,
  WorkerEnv
} from "./types";

export function buildSubmitAttachmentPayload(
  receiptNumber: string,
  pageId: string,
  expectedAttachmentCount: number,
  attachmentReferences: SubmitAttachmentReference[]
): SubmitAttachmentPayload {
  return {
    version: 1,
    receiptNumber,
    pageId,
    attachmentCount: expectedAttachmentCount,
    attachments: attachmentReferences,
    retryCount: 0
  };
}

export async function enqueueSubmitAttachmentPayload(
  env: WorkerEnv,
  payload: SubmitAttachmentPayload
) {
  await env.ATTACHMENT_PROCESSING_QUEUE.send(payload, {
    contentType: "json"
  });
}

export async function markAccidentAttachmentUploadStatus(
  env: WorkerEnv,
  pageId: string,
  status: (typeof ATTACHMENT_UPLOAD_STATUS)[keyof typeof ATTACHMENT_UPLOAD_STATUS]
) {
  await updatePageProperties(env, {
    pageId,
    properties: {
      [ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus]: {
        select: { name: status }
      }
    }
  });
}
