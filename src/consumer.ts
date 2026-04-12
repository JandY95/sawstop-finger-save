import {
  ACCIDENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
  ATTACHMENT_UPLOAD_STATUS
} from "./constants";
import {
  createAttachmentPage,
  findAttachmentPageByAttachmentId,
  recalculateAccidentHasFingerPhoto,
  updatePageProperties
} from "./notion";
import { promoteTmpAttachmentToFinalR2 } from "./r2";
import type {
  AttachmentUploadStatus,
  MessageBatch,
  NotionAttachmentDbPropertiesPayload,
  SubmitAttachmentPayload,
  SubmitAttachmentReference,
  WorkerEnv
} from "./types";

function toTitle(content: string) {
  return {
    title: [{ text: { content } }]
  };
}

function toRichText(content: string) {
  return {
    rich_text: [{ text: { content } }]
  };
}

function toRelation(pageId: string) {
  return {
    relation: [{ id: pageId }]
  };
}

function toStatus(name: string) {
  return {
    status: { name }
  };
}

function toNumber(value: number) {
  return {
    number: value
  };
}

function buildAttachmentId(receiptNumber: string, seq: number) {
  return `ATT-${receiptNumber}-${String(seq).padStart(4, "0")}`;
}

function buildAttachmentPageProperties(
  payload: SubmitAttachmentPayload,
  attachment: SubmitAttachmentReference,
  finalKey: string
): NotionAttachmentDbPropertiesPayload {
  return {
    [ATTACHMENT_DB_PROPERTY_NAMES.attachmentId]: toTitle(
      buildAttachmentId(payload.receiptNumber, attachment.seq)
    ),
    [ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]: toRelation(payload.pageId),
    [ATTACHMENT_DB_PROPERTY_NAMES.fileName]: toRichText(
      attachment.originalFileName
    ),
    [ATTACHMENT_DB_PROPERTY_NAMES.r2Key]: toRichText(finalKey),
    [ATTACHMENT_DB_PROPERTY_NAMES.status]: toStatus(
      ATTACHMENT_DB_STATUS.current
    ),
    [ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]: toNumber(attachment.seq)
  };
}

function buildAccidentAttachmentUploadStatus(
  expectedCount: number,
  successfulCount: number
): AttachmentUploadStatus {
  if (expectedCount <= 0) {
    return ATTACHMENT_UPLOAD_STATUS.complete;
  }

  if (successfulCount <= 0) {
    return ATTACHMENT_UPLOAD_STATUS.failure;
  }

  if (successfulCount < expectedCount) {
    return ATTACHMENT_UPLOAD_STATUS.partialFailure;
  }

  return ATTACHMENT_UPLOAD_STATUS.complete;
}

async function ensureAttachmentPage(
  env: WorkerEnv,
  payload: SubmitAttachmentPayload,
  attachment: SubmitAttachmentReference,
  finalKey: string
) {
  const attachmentId = buildAttachmentId(payload.receiptNumber, attachment.seq);
  const existingPage = await findAttachmentPageByAttachmentId(env, attachmentId);
  if (existingPage) {
    return existingPage;
  }

  return createAttachmentPage(env, {
    properties: buildAttachmentPageProperties(payload, attachment, finalKey)
  });
}

export async function processSubmitAttachmentPayload(
  env: WorkerEnv,
  payload: SubmitAttachmentPayload
) {
  let successfulCount = 0;

  for (const attachment of payload.attachments) {
    const { finalKey } = await promoteTmpAttachmentToFinalR2(env, {
      receiptNumber: payload.receiptNumber,
      tmpKey: attachment.tmpKey
    });
    await ensureAttachmentPage(env, payload, attachment, finalKey);
    successfulCount += 1;
  }

  const finalStatus = buildAccidentAttachmentUploadStatus(
    payload.attachmentCount,
    successfulCount
  );

  await updatePageProperties(env, {
    pageId: payload.pageId,
    properties: {
      [ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus]: {
        select: { name: finalStatus }
      }
    }
  });

  await recalculateAccidentHasFingerPhoto(env, payload.pageId);
}

export async function consumeAttachmentBatch(
  batch: MessageBatch<SubmitAttachmentPayload>,
  env: WorkerEnv
) {
  for (const message of batch.messages) {
    try {
      await processSubmitAttachmentPayload(env, message.body);
      message.ack();
    } catch (error) {
      console.error("Attachment consumer failed", error);
      message.retry();
    }
  }
}
