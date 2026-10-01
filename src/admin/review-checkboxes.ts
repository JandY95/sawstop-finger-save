import {
  ACCIDENT_REVIEW_CHECKBOX_PROPERTY_NAMES,
  CUSTOMER_FAILURE_MESSAGE
} from "../constants.ts";
import {
  getAccidentReviewCheckboxes,
  reportNotionOwnershipError,
  updateAccidentReviewCheckbox
} from "../notion.ts";
import type {
  AdminReviewCheckboxFailureResponse,
  AdminReviewCheckboxKey,
  AdminReviewCheckboxReadSuccessResponse,
  AdminReviewCheckboxUpdateRequest,
  AdminReviewCheckboxUpdateSuccessResponse,
  WorkerEnv
} from "../types.ts";
import { buildAdminPrivateResponseHeaders } from "./response-privacy.ts";

type AdminReviewCheckboxResponse =
  | AdminReviewCheckboxReadSuccessResponse
  | AdminReviewCheckboxUpdateSuccessResponse
  | AdminReviewCheckboxFailureResponse;

const REVIEW_KEYS = new Set<AdminReviewCheckboxKey>(
  Object.keys(
    ACCIDENT_REVIEW_CHECKBOX_PROPERTY_NAMES
  ) as AdminReviewCheckboxKey[]
);

function jsonResponse(body: AdminReviewCheckboxResponse, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: buildAdminPrivateResponseHeaders({
      "Content-Type": "application/json; charset=utf-8"
    })
  });
}

function failureResponse(status: number) {
  return jsonResponse(
    {
      ok: false,
      message: CUSTOMER_FAILURE_MESSAGE
    },
    status
  );
}

function isReviewKey(value: unknown): value is AdminReviewCheckboxKey {
  return typeof value === "string" && REVIEW_KEYS.has(value as AdminReviewCheckboxKey);
}

async function handleRead(request: Request, env: WorkerEnv) {
  const pageId = (new URL(request.url).searchParams.get("pageId") ?? "").trim();
  if (pageId.length === 0) {
    return failureResponse(400);
  }

  const values = await getAccidentReviewCheckboxes(env, pageId);
  return jsonResponse({ ok: true, values }, 200);
}

async function handleUpdate(request: Request, env: WorkerEnv) {
  let body: Partial<AdminReviewCheckboxUpdateRequest>;

  try {
    body = (await request.json()) as Partial<AdminReviewCheckboxUpdateRequest>;
  } catch {
    return failureResponse(400);
  }

  const pageId = String(body.pageId ?? "").trim();
  if (
    pageId.length === 0 ||
    !isReviewKey(body.reviewKey) ||
    typeof body.checked !== "boolean"
  ) {
    return failureResponse(400);
  }

  const values = await updateAccidentReviewCheckbox(env, {
    pageId,
    reviewKey: body.reviewKey,
    checked: body.checked
  });

  return jsonResponse(
    {
      ok: true,
      updatedReviewKey: body.reviewKey,
      values
    },
    200
  );
}

export async function handleAdminReviewCheckboxes(
  request: Request,
  env: WorkerEnv
) {
  try {
    if (request.method === "GET") {
      return await handleRead(request, env);
    }

    if (request.method === "POST") {
      return await handleUpdate(request, env);
    }

    return failureResponse(405);
  } catch (error) {
    if (reportNotionOwnershipError("admin_review_checkboxes", error)) {
      return failureResponse(409);
    }

    return failureResponse(500);
  }
}
