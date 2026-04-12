import { R2_ATTACHMENTS_PREFIX, R2_TMP_PREFIX } from "./constants.ts";
import type { WorkerEnv } from "./types.ts";

export function sanitizeAttachmentFileName(fileName: string) {
  return fileName.replace(/[^\w.-]+/g, "_");
}

function buildTmpAttachmentKey(
  receiptNumber: string,
  seq: number,
  originalFileName: string
) {
  const seq4 = String(seq).padStart(4, "0");
  const timestamp = Date.now();
  const sanitizedFileName = sanitizeAttachmentFileName(originalFileName);

  return `${R2_TMP_PREFIX}/${receiptNumber}/${seq4}_${timestamp}_${sanitizedFileName}`;
}

function buildFinalAttachmentKey(receiptNumber: string, tmpKey: string) {
  const fileName = tmpKey.split("/").pop();
  if (!fileName) {
    throw new Error(`Invalid tmp attachment key: ${tmpKey}`);
  }

  return `${R2_ATTACHMENTS_PREFIX}/${receiptNumber}/${fileName}`;
}

function buildAdminFinalAttachmentKey(
  receiptNumber: string,
  seq: number,
  originalFileName: string
) {
  const seq4 = String(seq).padStart(4, "0");
  const timestamp = Date.now();
  const sanitizedFileName = sanitizeAttachmentFileName(originalFileName);

  return `${R2_ATTACHMENTS_PREFIX}/${receiptNumber}/${seq4}_${timestamp}_${sanitizedFileName}`;
}

export async function uploadAttachmentToTmpR2(
  env: WorkerEnv,
  {
    receiptNumber,
    seq,
    file
  }: {
    receiptNumber: string;
    seq: number;
    file: {
      name: string;
      type: string;
      size: number;
      bytes: ArrayBuffer;
    };
  }
) {
  const tmpKey = buildTmpAttachmentKey(receiptNumber, seq, file.name);

  await env.ATTACHMENT_BUCKET.put(tmpKey, file.bytes, {
    httpMetadata: {
      contentType: file.type
    }
  });

  return {
    tmpKey
  };
}

export async function promoteTmpAttachmentToFinalR2(
  env: WorkerEnv,
  {
    receiptNumber,
    tmpKey
  }: {
    receiptNumber: string;
    tmpKey: string;
  }
) {
  const finalKey = buildFinalAttachmentKey(receiptNumber, tmpKey);
  const existingFinal = await env.ATTACHMENT_BUCKET.get(finalKey);
  if (existingFinal) {
    return {
      finalKey,
      contentType: existingFinal.httpMetadata?.contentType ?? null
    };
  }

  const tmpObject = await env.ATTACHMENT_BUCKET.get(tmpKey);
  if (!tmpObject) {
    throw new Error(`Missing tmp attachment object: ${tmpKey}`);
  }

  await env.ATTACHMENT_BUCKET.put(finalKey, await tmpObject.arrayBuffer(), {
    httpMetadata: {
      contentType: tmpObject.httpMetadata?.contentType
    }
  });
  await env.ATTACHMENT_BUCKET.delete(tmpKey);

  return {
    finalKey,
    contentType: tmpObject.httpMetadata?.contentType ?? null
  };
}

export async function uploadAdminAttachmentToFinalR2(
  env: WorkerEnv,
  {
    receiptNumber,
    seq,
    file
  }: {
    receiptNumber: string;
    seq: number;
    file: File;
  }
) {
  const finalKey = buildAdminFinalAttachmentKey(receiptNumber, seq, file.name);

  await env.ATTACHMENT_BUCKET.put(finalKey, file, {
    httpMetadata: {
      contentType: file.type
    }
  });

  return {
    finalKey
  };
}
