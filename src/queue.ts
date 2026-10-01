import { ACCIDENT_DB_PROPERTY_NAMES, ATTACHMENT_UPLOAD_STATUS } from "./constants";
import {
  runExternalCallWithRetry,
  type ExternalRetryDependencies
} from "./external-retry";
import { updatePageProperties } from "./notion";
import { MAX_ATTACHMENT_RETRY_COUNT } from "./queue-payload";
import type {
  SubmitAttachmentPayload,
  SubmitAttachmentReference,
  WorkerEnv
} from "./types";

export { MAX_ATTACHMENT_RETRY_COUNT };

export function buildRetrySubmitAttachmentPayload(
  payload: SubmitAttachmentPayload
): SubmitAttachmentPayload | null {
  if (payload.retryCount >= MAX_ATTACHMENT_RETRY_COUNT) {
    return null;
  }

  return {
    ...payload,
    retryCount: payload.retryCount + 1,
    attachments: payload.attachments.map((attachment) => ({ ...attachment }))
  };
}

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
  payload: SubmitAttachmentPayload,
  retryDependencies?: ExternalRetryDependencies
) {
  await runExternalCallWithRetry(
    "queue",
    () => env.ATTACHMENT_PROCESSING_QUEUE.send(payload, {
      contentType: "json"
    }),
    retryDependencies
  );
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
