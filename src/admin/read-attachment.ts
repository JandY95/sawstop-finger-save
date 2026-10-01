import {
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
  CUSTOMER_ATTACHMENT_ALLOWED_MIME_TYPES
} from "../constants.ts";
import { isAdminAuthenticated } from "./auth.ts";
import {
  assertAttachmentPageOwnership,
  NotionPageNotFoundError,
  reportNotionOwnershipError
} from "../notion.ts";
import { readFinalAttachmentFromR2 } from "../r2.ts";
import type { WorkerEnv } from "../types.ts";
import { buildAdminPrivateResponseHeaders } from "./response-privacy.ts";

export const ADMIN_ATTACHMENT_READ_ROUTE = "/admin/attachments/read";

function emptyReadResponse(status: number) {
  return new Response(null, {
    status,
    headers: buildAdminPrivateResponseHeaders()
  });
}

function propertyPlainText(
  property:
    | {
        rich_text?: Array<{ plain_text?: string }>;
      }
    | undefined
) {
  return (property?.rich_text ?? [])
    .map((item) => item.plain_text ?? "")
    .join("")
    .trim();
}

function encodeContentDispositionFileName(fileName: string) {
  const normalizedFileName = fileName.trim() || "attachment";
  return encodeURIComponent(normalizedFileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function safeContentType(contentType: string | null) {
  if (
    contentType &&
    CUSTOMER_ATTACHMENT_ALLOWED_MIME_TYPES.includes(
      contentType as (typeof CUSTOMER_ATTACHMENT_ALLOWED_MIME_TYPES)[number]
    )
  ) {
    return contentType;
  }

  return "application/octet-stream";
}

export async function handleAdminAttachmentRead(
  request: Request,
  env: WorkerEnv
) {
  try {
    if (!(await isAdminAuthenticated(request, env))) {
      return emptyReadResponse(401);
    }

    const url = new URL(request.url);
    const pageId = (url.searchParams.get("pageId") ?? "").trim();
    const attachmentPageId = (
      url.searchParams.get("attachmentPageId") ?? ""
    ).trim();

    if (pageId.length === 0 || attachmentPageId.length === 0) {
      return emptyReadResponse(400);
    }

    const { attachmentPage } = await assertAttachmentPageOwnership(env, {
      pageId,
      attachmentPageId
    });
    const properties = attachmentPage.properties ?? {};
    const status =
      properties[ATTACHMENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null;

    if (status !== ATTACHMENT_DB_STATUS.current) {
      return emptyReadResponse(404);
    }

    const r2Key = propertyPlainText(
      properties[ATTACHMENT_DB_PROPERTY_NAMES.r2Key]
    );
    const fileName = propertyPlainText(
      properties[ATTACHMENT_DB_PROPERTY_NAMES.fileName]
    );
    const object = await readFinalAttachmentFromR2(env, r2Key);

    if (!object) {
      return emptyReadResponse(404);
    }

    const contentType = safeContentType(object.contentType);
    const requestedDownload = url.searchParams.get("download") === "1";
    const disposition =
      requestedDownload || contentType === "application/octet-stream"
        ? "attachment"
        : "inline";
    const headers = buildAdminPrivateResponseHeaders({
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeContentDispositionFileName(fileName)}`,
      "Content-Type": contentType
    });

    return new Response(object.bytes, {
      status: 200,
      headers
    });
  } catch (error) {
    if (
      reportNotionOwnershipError("admin_attachment_read", error) ||
      error instanceof NotionPageNotFoundError
    ) {
      return emptyReadResponse(404);
    }

    console.error("Admin attachment read failed", {
      route: "admin_attachment_read",
      errorName: error instanceof Error ? error.name : "unknown"
    });
    return emptyReadResponse(500);
  }
}
