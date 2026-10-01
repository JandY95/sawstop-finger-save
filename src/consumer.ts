import {
  ACCIDENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
  ATTACHMENT_UPLOAD_STATUS,
  R2_TMP_PREFIX
} from "./constants";
import {
  buildAttachmentId,
  buildLegacyAttachmentId,
  createAttachmentPage,
  findAttachmentPagesByAttachmentId,
  recalculateAccidentHasFingerPhoto,
  resetAccidentAttachmentFinalCheck,
  updatePageProperties
} from "./notion";
import {
  buildFinalAttachmentKey,
  promoteTmpAttachmentToFinalR2
} from "./r2";
import {
  buildRetrySubmitAttachmentPayload,
  enqueueSubmitAttachmentPayload
} from "./queue";
import { validateSubmitAttachmentPayload } from "./queue-payload";
import { logStructuredError } from "./error-logging";
import type {
  AttachmentUploadStatus,
  MessageBatch,
  NotionAttachmentDbPropertiesPayload,
  NotionAttachmentPageRecord,
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

export class AttachmentOwnershipConflictError extends Error {
  constructor(attachmentId: string) {
    super(`Attachment ownership conflict for ${attachmentId}; manual recovery required`);
    this.name = "AttachmentOwnershipConflictError";
  }
}

export class AttachmentReadbackMismatchError extends Error {
  constructor(attachmentId: string, reason: string) {
    super(
      `Attachment readback mismatch for ${attachmentId}: ${reason}; manual recovery required`
    );
    this.name = "AttachmentReadbackMismatchError";
  }
}

export type SubmitAttachmentProcessingResult =
  | {
      attachment: SubmitAttachmentReference;
      status: "success";
    }
  | {
      attachment: SubmitAttachmentReference;
      status: "failure";
      error: unknown;
    };

function buildAttachmentPageProperties(
  payload: SubmitAttachmentPayload,
  attachment: SubmitAttachmentReference,
  finalKey: string
): NotionAttachmentDbPropertiesPayload {
  return {
    [ATTACHMENT_DB_PROPERTY_NAMES.attachmentId]: toTitle(
      buildAttachmentId(payload.pageId, attachment.seq)
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

function selectOwnedAttachmentPage(
  pages: NotionAttachmentPageRecord[],
  {
    attachmentId,
    pageId,
    r2Key,
    allowUnrelatedPages
  }: {
    attachmentId: string;
    pageId: string;
    r2Key: string;
    allowUnrelatedPages: boolean;
  }
) {
  const ownedPages = pages.filter(
    (page) =>
      page.accidentPageIds.length === 1 &&
      page.accidentPageIds[0] === pageId &&
      page.r2Key === r2Key
  );

  if (
    ownedPages.length === 1 &&
    (allowUnrelatedPages || pages.length === 1)
  ) {
    return ownedPages[0];
  }

  if (pages.length > 0) {
    throw new AttachmentOwnershipConflictError(attachmentId);
  }

  return null;
}

async function resolveAttachmentWriteTarget(
  env: WorkerEnv,
  payload: SubmitAttachmentPayload,
  attachment: SubmitAttachmentReference
) {
  const attachmentId = buildAttachmentId(payload.pageId, attachment.seq);
  const finalKey = buildFinalAttachmentKey(payload.pageId, attachment.tmpKey);
  const existingPages = await findAttachmentPagesByAttachmentId(env, attachmentId);
  const existingPage = selectOwnedAttachmentPage(existingPages, {
    attachmentId,
    pageId: payload.pageId,
    r2Key: finalKey,
    allowUnrelatedPages: false
  });
  if (existingPage) {
    return { attachmentId, existingPage, finalKey };
  }

  const legacyAttachmentId = buildLegacyAttachmentId(
    payload.receiptNumber,
    attachment.seq
  );
  const usesLegacyTmpNamespace = attachment.tmpKey.startsWith(
    `${R2_TMP_PREFIX}/${payload.receiptNumber}/`
  );
  if (legacyAttachmentId !== attachmentId && usesLegacyTmpNamespace) {
    const legacyFinalKey = buildFinalAttachmentKey(
      payload.receiptNumber,
      attachment.tmpKey
    );
    const legacyPages = await findAttachmentPagesByAttachmentId(
      env,
      legacyAttachmentId
    );
    const legacyPage = selectOwnedAttachmentPage(legacyPages, {
      attachmentId: legacyAttachmentId,
      pageId: payload.pageId,
      r2Key: legacyFinalKey,
      allowUnrelatedPages: true
    });
    if (legacyPage) {
      return {
        attachmentId: legacyAttachmentId,
        existingPage: legacyPage,
        finalKey: legacyFinalKey
      };
    }
  }

  return { attachmentId, existingPage: null, finalKey };
}

async function ensureAttachmentPage(
  env: WorkerEnv,
  payload: SubmitAttachmentPayload,
  attachment: SubmitAttachmentReference,
  {
    existingPage,
    finalKey
  }: {
    existingPage: NotionAttachmentPageRecord | null;
    finalKey: string;
  }
) {
  if (existingPage) {
    return existingPage;
  }

  return createAttachmentPage(env, {
    properties: buildAttachmentPageProperties(payload, attachment, finalKey)
  });
}

async function readbackAttachmentWrite(
  env: WorkerEnv,
  {
    attachmentId,
    pageId,
    finalKey
  }: {
    attachmentId: string;
    pageId: string;
    finalKey: string;
  }
) {
  const pages = await findAttachmentPagesByAttachmentId(env, attachmentId);
  if (pages.length !== 1) {
    throw new AttachmentReadbackMismatchError(
      attachmentId,
      `expected exactly 1 attachment row but found ${pages.length}`
    );
  }

  const [page] = pages;
  if (
    !page ||
    page.accidentPageIds.length !== 1 ||
    page.accidentPageIds[0] !== pageId
  ) {
    throw new AttachmentReadbackMismatchError(
      attachmentId,
      "accident relation does not match the Queue payload pageId"
    );
  }

  if (page.r2Key !== finalKey) {
    throw new AttachmentReadbackMismatchError(
      attachmentId,
      "final R2 key does not match the promoted object key"
    );
  }

  return page;
}

async function updateAccidentAttachmentResult(
  env: WorkerEnv,
  payload: SubmitAttachmentPayload,
  successfulCount: number
) {
  const finalStatus = buildAccidentAttachmentUploadStatus(
    payload.attachmentCount,
    successfulCount
  );

  await updatePageProperties(env, {
    pageId: payload.pageId,
    properties: {
      [ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus]: {
        select: { name: finalStatus }
      },
      ...(successfulCount > 0 ? resetAccidentAttachmentFinalCheck() : {})
    }
  });

  if (successfulCount > 0) {
    await recalculateAccidentHasFingerPhoto(env, payload.pageId);
  }
}

export async function processSubmitAttachmentPayload(
  env: WorkerEnv,
  payload: SubmitAttachmentPayload
) {
  const results = await processSubmitAttachmentFiles(env, payload);
  const successfulCount = results.filter(
    (result) => result.status === "success"
  ).length;
  await updateAccidentAttachmentResult(env, payload, successfulCount);

  return results;
}

async function processSubmitAttachmentFiles(
  env: WorkerEnv,
  payload: SubmitAttachmentPayload
) {
  const results: SubmitAttachmentProcessingResult[] = [];

  for (const attachment of payload.attachments) {
    try {
      const target = await resolveAttachmentWriteTarget(env, payload, attachment);
      await promoteTmpAttachmentToFinalR2(env, {
        finalKey: target.finalKey,
        tmpKey: attachment.tmpKey
      });
      await ensureAttachmentPage(env, payload, attachment, target);
      await readbackAttachmentWrite(env, {
        attachmentId: target.attachmentId,
        pageId: payload.pageId,
        finalKey: target.finalKey
      });
      results.push({ attachment, status: "success" });
    } catch (error) {
      results.push({ attachment, status: "failure", error });
    }
  }

  return results;
}

function buildRetryFailureLogContext(
  payload: SubmitAttachmentPayload,
  failures: Extract<SubmitAttachmentProcessingResult, { status: "failure" }>[]
) {
  return {
    retryCount: payload.retryCount,
    fileCount: payload.attachmentCount,
    failureCount: failures.length,
    failedSeqs: failures.map(({ attachment }) => attachment.seq),
  };
}

export async function consumeAttachmentBatch(
  batch: MessageBatch<unknown>,
  env: WorkerEnv
) {
  for (const message of batch.messages) {
    const validation = validateSubmitAttachmentPayload(message.body);
    if (validation.ok === false) {
      logStructuredError({
        receiptNumber: validation.receiptNumber ?? null,
        route: "attachment-consumer",
        stage: "consumer_payload_validate",
        reasonCode: validation.reason,
        context: {
          fileCount: null,
          failureCount: null
        }
      });
      message.ack();
      continue;
    }

    const payload = validation.payload;
    const results = await processSubmitAttachmentFiles(env, payload);
    const failures = results.filter(
      (
        result
      ): result is Extract<
        SubmitAttachmentProcessingResult,
        { status: "failure" }
      > => result.status === "failure"
    );
    const successfulCount = results.length - failures.length;

    if (failures.length === 0) {
      try {
        await updateAccidentAttachmentResult(env, payload, successfulCount);
      } catch (error) {
        logStructuredError({
          receiptNumber: payload.receiptNumber,
          route: "attachment-consumer",
          stage: "consumer_final_write_back",
          reasonCode: "final_write_back_failed",
          error,
          context: {
            retryCount: payload.retryCount,
            fileCount: payload.attachmentCount,
            failureCount: 1
          }
        });
      }
      message.ack();
      continue;
    }

    const retryPayload = buildRetrySubmitAttachmentPayload(payload);
    if (retryPayload) {
      try {
        await enqueueSubmitAttachmentPayload(env, retryPayload);
      } catch (error) {
        let finalWriteBackError: unknown;
        try {
          await updateAccidentAttachmentResult(env, payload, successfulCount);
        } catch (writeBackError) {
          finalWriteBackError = writeBackError;
        }

        logStructuredError({
          receiptNumber: payload.receiptNumber,
          route: "attachment-consumer",
          stage: "consumer_retry_enqueue",
          reasonCode: "retry_enqueue_failed",
          error,
          context: buildRetryFailureLogContext(payload, failures)
        });
        if (finalWriteBackError) {
          logStructuredError({
            receiptNumber: payload.receiptNumber,
            route: "attachment-consumer",
            stage: "consumer_final_write_back",
            reasonCode: "final_write_back_failed",
            error: finalWriteBackError,
            context: buildRetryFailureLogContext(payload, failures)
          });
        }
      }
      message.ack();
      continue;
    }

    let finalWriteBackError: unknown;
    try {
      await updateAccidentAttachmentResult(env, payload, successfulCount);
    } catch (error) {
      finalWriteBackError = error;
    }

    logStructuredError({
      receiptNumber: payload.receiptNumber,
      route: "attachment-consumer",
      stage: "consumer_retry_exhausted",
      reasonCode: "retry_exhausted",
      error: failures[0]?.error,
      context: buildRetryFailureLogContext(payload, failures)
    });
    if (finalWriteBackError) {
      logStructuredError({
        receiptNumber: payload.receiptNumber,
        route: "attachment-consumer",
        stage: "consumer_final_write_back",
        reasonCode: "final_write_back_failed",
        error: finalWriteBackError,
        context: buildRetryFailureLogContext(payload, failures)
      });
    }
    message.ack();
  }
}
