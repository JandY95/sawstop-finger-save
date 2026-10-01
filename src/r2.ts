import { R2_ATTACHMENTS_PREFIX, R2_TMP_PREFIX } from "./constants.ts";
import {
  runExternalCallWithRetry,
  type ExternalRetryDependencies
} from "./external-retry.ts";
import type { WorkerEnv } from "./types.ts";

export function sanitizeAttachmentFileName(fileName: string) {
  return fileName.replace(/[^\w.-]+/g, "_");
}

export function buildTmpAttachmentKey(
  pageId: string,
  seq: number,
  originalFileName: string
) {
  const seq4 = String(seq).padStart(4, "0");
  const timestamp = Date.now();
  const sanitizedFileName = sanitizeAttachmentFileName(originalFileName);

  return `${R2_TMP_PREFIX}/${pageId}/${seq4}_${timestamp}_${sanitizedFileName}`;
}

export function buildFinalAttachmentKey(pageId: string, tmpKey: string) {
  const fileName = tmpKey.split("/").pop();
  if (!fileName) {
    throw new Error(`Invalid tmp attachment key: ${tmpKey}`);
  }

  return `${R2_ATTACHMENTS_PREFIX}/${pageId}/${fileName}`;
}

export function buildAdminFinalAttachmentKey(
  pageId: string,
  seq: number,
  originalFileName: string,
  timestamp = Date.now()
) {
  const seq4 = String(seq).padStart(4, "0");
  const sanitizedFileName = sanitizeAttachmentFileName(originalFileName);

  return `${R2_ATTACHMENTS_PREFIX}/${pageId}/${seq4}_${timestamp}_${sanitizedFileName}`;
}

export async function uploadAttachmentToTmpR2(
  env: WorkerEnv,
  {
    pageId,
    seq,
    file
  }: {
    pageId: string;
    seq: number;
    file: {
      name: string;
      type: string;
      size: number;
      bytes: ArrayBuffer;
    };
  },
  retryDependencies?: ExternalRetryDependencies
) {
  const tmpKey = buildTmpAttachmentKey(pageId, seq, file.name);

  await runExternalCallWithRetry(
    "r2",
    () => env.ATTACHMENT_BUCKET.put(tmpKey, file.bytes, {
      httpMetadata: {
        contentType: file.type
      }
    }),
    retryDependencies
  );

  return {
    tmpKey
  };
}

export async function promoteTmpAttachmentToFinalR2(
  env: WorkerEnv,
  {
    finalKey,
    tmpKey
  }: {
    finalKey: string;
    tmpKey: string;
  },
  retryDependencies?: ExternalRetryDependencies
) {
  const existingFinal = await runExternalCallWithRetry(
    "r2",
    () => env.ATTACHMENT_BUCKET.get(finalKey),
    retryDependencies
  );
  if (existingFinal) {
    return {
      finalKey,
      contentType: existingFinal.httpMetadata?.contentType ?? null
    };
  }

  const tmpObject = await runExternalCallWithRetry(
    "r2",
    () => env.ATTACHMENT_BUCKET.get(tmpKey),
    retryDependencies
  );
  if (!tmpObject) {
    throw new Error(`Missing tmp attachment object: ${tmpKey}`);
  }

  const tmpBytes = await tmpObject.arrayBuffer();
  await runExternalCallWithRetry(
    "r2",
    () => env.ATTACHMENT_BUCKET.put(finalKey, tmpBytes, {
      httpMetadata: {
        contentType: tmpObject.httpMetadata?.contentType
      }
    }),
    retryDependencies
  );
  await env.ATTACHMENT_BUCKET.delete(tmpKey);

  return {
    finalKey,
    contentType: tmpObject.httpMetadata?.contentType ?? null
  };
}

export async function uploadAdminAttachmentToFinalR2(
  env: WorkerEnv,
  {
    pageId,
    seq,
    file,
    finalKey: reservedFinalKey
  }: {
    pageId: string;
    seq: number;
    file: File;
    finalKey?: string;
  },
  retryDependencies?: ExternalRetryDependencies
) {
  const finalKey =
    reservedFinalKey ?? buildAdminFinalAttachmentKey(pageId, seq, file.name);
  const existingObject = await runExternalCallWithRetry(
    "r2",
    () => env.ATTACHMENT_BUCKET.get(finalKey),
    retryDependencies
  );
  if (existingObject) {
    return {
      finalKey
    };
  }

  await runExternalCallWithRetry(
    "r2",
    () => env.ATTACHMENT_BUCKET.put(finalKey, file, {
      httpMetadata: {
        contentType: file.type
      }
    }),
    retryDependencies
  );

  return {
    finalKey
  };
}

export async function confirmAdminAttachmentPreservedForRecovery(
  env: WorkerEnv,
  {
    pageId,
    finalKey
  }: {
    pageId: string;
    finalKey: string;
  },
  retryDependencies?: ExternalRetryDependencies
) {
  const expectedPrefix = `${R2_ATTACHMENTS_PREFIX}/${pageId}/`;
  if (!finalKey.startsWith(expectedPrefix) || finalKey.length <= expectedPrefix.length) {
    throw new Error("Admin attachment recovery key does not match its accident page");
  }

  return (
    await runExternalCallWithRetry(
      "r2",
      () => env.ATTACHMENT_BUCKET.get(finalKey),
      retryDependencies
    )
  ) !== null;
}

export async function deleteFinalAttachmentFromR2(env: WorkerEnv, finalKey: string) {
  const existingObject = await env.ATTACHMENT_BUCKET.get(finalKey);

  if (!existingObject) {
    return {
      existed: false
    };
  }

  await env.ATTACHMENT_BUCKET.delete(finalKey);

  return {
    existed: true
  };
}

export async function readFinalAttachmentFromR2(
  env: WorkerEnv,
  finalKey: string,
  retryDependencies?: ExternalRetryDependencies
) {
  const normalizedKey = finalKey.trim();
  if (
    !normalizedKey.startsWith(`${R2_ATTACHMENTS_PREFIX}/`) ||
    normalizedKey.length <= R2_ATTACHMENTS_PREFIX.length + 1
  ) {
    return null;
  }

  const object = await runExternalCallWithRetry(
    "r2",
    () => env.ATTACHMENT_BUCKET.get(normalizedKey),
    retryDependencies
  );
  if (!object) {
    return null;
  }

  return {
    bytes: await object.arrayBuffer(),
    contentType: object.httpMetadata?.contentType?.trim().toLowerCase() ?? null
  };
}
