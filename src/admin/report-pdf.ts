import {
  ADMIN_SESSION_COOKIE_NAME,
  CUSTOMER_FAILURE_MESSAGE
} from "../constants.ts";
import {
  getAccidentPageReportData,
  reportNotionOwnershipError
} from "../notion.ts";
import type {
  BrowserRunCookie,
  BrowserRunPdfOptions,
  WorkerEnv
} from "../types.ts";
import { renderAdminReportHtml } from "./report.ts";
import { buildAdminPrivateResponseHeaders } from "./response-privacy.ts";

const PDF_CONTENT_TYPE = "application/pdf";
const PDF_FILE_NAME = "sawstop-report.pdf";
const LOCAL_ADMIN_SESSION_COOKIE_NAME = "sawstop-admin-session";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlErrorResponse(status: number) {
  return new Response(`<p>${escapeHtml(CUSTOMER_FAILURE_MESSAGE)}</p>`, {
    status,
    headers: buildAdminPrivateResponseHeaders({
      "Content-Type": "text/html; charset=utf-8",
    })
  });
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name && rawValue.length > 0) {
      return rawValue.join("=");
    }
  }

  return null;
}

function getBrowserRunSessionCookies(request: Request): BrowserRunCookie[] {
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  const name = secure
    ? ADMIN_SESSION_COOKIE_NAME
    : LOCAL_ADMIN_SESSION_COOKIE_NAME;
  const value = readCookie(request, name);

  if (!value) {
    throw new Error("Authenticated admin session cookie is unavailable for PDF assets");
  }

  return [
    {
      httpOnly: true,
      name,
      sameSite: "Strict",
      secure,
      url: `${url.origin}/`,
      value
    }
  ];
}

export function buildBrowserRunPdfOptions(
  html: string,
  cookies: BrowserRunCookie[]
): BrowserRunPdfOptions {
  return {
    actionTimeout: 45000,
    cookies,
    emulateMediaType: "print",
    html,
    pdfOptions: {
      displayHeaderFooter: false,
      format: "a4",
      landscape: false,
      preferCSSPageSize: true,
      printBackground: true,
      scale: 1,
      tagged: true
    },
    setJavaScriptEnabled: true,
    waitForSelector: {
      selector: 'body[data-pdf-ready="true"]',
      timeout: 30000
    }
  };
}

function pdfResponse(upstream: Response) {
  const headers = buildAdminPrivateResponseHeaders({
    "Content-Disposition": `attachment; filename="${PDF_FILE_NAME}"`,
    "Content-Type": PDF_CONTENT_TYPE
  });
  const browserMsUsed = upstream.headers.get("X-Browser-Ms-Used");

  if (browserMsUsed && /^\d+(?:\.\d+)?$/.test(browserMsUsed)) {
    headers.set("X-Browser-Ms-Used", browserMsUsed);
  }

  return new Response(upstream.body, { status: 200, headers });
}

export async function renderAdminReportPdf(request: Request, env: WorkerEnv) {
  const url = new URL(request.url);
  const pageId = (url.searchParams.get("pageId") ?? "").trim();

  if (!pageId) {
    return new Response("<p>pageId가 필요합니다.</p>", {
      status: 400,
      headers: buildAdminPrivateResponseHeaders({
        "Content-Type": "text/html; charset=utf-8"
      })
    });
  }

  try {
    const { blocks, attachments } = await getAccidentPageReportData(env, pageId);
    const html = renderAdminReportHtml(request, pageId, blocks, attachments);
    const cookies = getBrowserRunSessionCookies(request);
    const upstream = await env.BROWSER.quickAction(
      "pdf",
      buildBrowserRunPdfOptions(html, cookies)
    );

    if (
      !upstream.ok ||
      !upstream.body ||
      !(upstream.headers.get("Content-Type") ?? "")
        .toLowerCase()
        .startsWith(PDF_CONTENT_TYPE)
    ) {
      throw new Error("Browser Run PDF rendering failed");
    }

    return pdfResponse(upstream);
  } catch (error) {
    if (reportNotionOwnershipError("admin_report_pdf", error)) {
      return htmlErrorResponse(409);
    }

    console.error("Failed to render admin report PDF", error);
    return htmlErrorResponse(502);
  }
}
