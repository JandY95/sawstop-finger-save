import {
  ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
  CUSTOMER_FAILURE_MESSAGE,
  NOTION_API_BASE_URL,
  NOTION_API_VERSION
} from "../constants.ts";
import {
  listFifoTrashCandidates,
  markAttachmentPagePermanentlyDeleted,
  recalculateAccidentHasFingerPhoto,
  resetAccidentAttachmentFinalCheck,
  updatePageProperties
} from "../notion.ts";
import { deleteFinalAttachmentFromR2 } from "../r2.ts";
import type {
  AdminProcessFifoTrashFailureResponse,
  AdminProcessFifoTrashRequest,
  AdminProcessFifoTrashResultItem,
  AdminProcessFifoTrashSuccessResponse,
  WorkerEnv
} from "../types.ts";

function jsonResponse(
  body:
    | AdminProcessFifoTrashSuccessResponse
    | AdminProcessFifoTrashFailureResponse,
  status: number
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function getNotionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_API_VERSION
  };
}

type FifoCandidate = {
  attachmentPageId: string;
  accidentPageId: string | null;
  r2Key: string | null;
};

async function listForcedFifoCandidates(
  env: WorkerEnv,
  {
    limit,
    pageId
  }: {
    limit: number;
    pageId?: string;
  }
): Promise<FifoCandidate[]> {
  const response = await fetch(
    `${NOTION_API_BASE_URL}/databases/${env.NOTION_ATTACHMENT_DB_ID}/query`,
    {
      method: "POST",
      headers: getNotionHeaders(env.NOTION_TOKEN),
      body: JSON.stringify({
        page_size: limit,
        filter: pageId
          ? {
              and: [
                {
                  property: ATTACHMENT_DB_PROPERTY_NAMES.status,
                  status: {
                    equals: ATTACHMENT_DB_STATUS.trash
                  }
                },
                {
                  property: ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation,
                  relation: {
                    contains: pageId
                  }
                }
              ]
            }
          : {
              property: ATTACHMENT_DB_PROPERTY_NAMES.status,
              status: {
                equals: ATTACHMENT_DB_STATUS.trash
              }
            }
      })
    }
  );

  if (!response.ok) {
    throw new Error("forced_fifo_query_failed");
  }

  const data = (await response.json()) as {
    results?: Array<{
      id?: string;
      properties?: Record<string, unknown>;
    }>;
  };

  return (data.results ?? [])
    .map((result) => {
      const properties = result.properties ?? {};
      const relationProperty = properties[
        ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation
      ] as { relation?: Array<{ id?: string }> } | undefined;
      const r2KeyProperty = properties[ATTACHMENT_DB_PROPERTY_NAMES.r2Key] as
        | { rich_text?: Array<{ plain_text?: string }> }
        | undefined;
      const permanentDeleteAtProperty = properties[
        ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES.permanentDeleteAt
      ] as { date?: { start?: string } | null } | undefined;

      return {
        attachmentPageId: result.id ?? "",
        accidentPageId: relationProperty?.relation?.[0]?.id ?? null,
        r2Key: r2KeyProperty?.rich_text?.[0]?.plain_text ?? null,
        permanentDeleteAt: permanentDeleteAtProperty?.date?.start ?? null
      };
    })
    .filter((candidate) => candidate.attachmentPageId.length > 0)
    .sort((left, right) => {
      const leftValue = left.permanentDeleteAt ?? "";
      const rightValue = right.permanentDeleteAt ?? "";
      return leftValue.localeCompare(rightValue);
    });
}

async function readRequestBody(request: Request) {
  const rawBody = await request.text();
  if (rawBody.trim().length === 0) {
    return {} as Partial<AdminProcessFifoTrashRequest>;
  }

  return JSON.parse(rawBody) as Partial<AdminProcessFifoTrashRequest>;
}

export async function handleAdminProcessFifoTrash(
  request: Request,
  env: WorkerEnv
) {
  try {
    const body = await readRequestBody(request);
    const requestedLimit = Number(body.limit);
    const force = body.force === true;
    const pageId = typeof body.pageId === "string" && body.pageId.trim().length > 0
      ? body.pageId.trim()
      : undefined;
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.trunc(requestedLimit), 20)
        : 20;

    const candidates = force
      ? await listForcedFifoCandidates(env, { limit, pageId })
      : await listFifoTrashCandidates(env, limit);
    const results: AdminProcessFifoTrashResultItem[] = [];
    let processedCount = 0;
    let failedCount = 0;

    for (const candidate of candidates) {
      try {
        let reason: string | undefined;

        if (candidate.r2Key) {
          const deleteResult = await deleteFinalAttachmentFromR2(env, candidate.r2Key);
          if (!deleteResult.existed) {
            reason = "r2_missing";
          }
        } else {
          reason = "missing_r2_key";
        }

        await markAttachmentPagePermanentlyDeleted(env, {
          attachmentPageId: candidate.attachmentPageId
        });

        if (candidate.accidentPageId) {
          await updatePageProperties(env, {
            pageId: candidate.accidentPageId,
            properties: resetAccidentAttachmentFinalCheck()
          });

          await recalculateAccidentHasFingerPhoto(env, candidate.accidentPageId);
        }

        processedCount += 1;
        results.push({
          attachmentPageId: candidate.attachmentPageId,
          accidentPageId: candidate.accidentPageId,
          r2Key: candidate.r2Key,
          ok: true,
          reason
        });
      } catch (error) {
        failedCount += 1;
        results.push({
          attachmentPageId: candidate.attachmentPageId,
          accidentPageId: candidate.accidentPageId,
          r2Key: candidate.r2Key,
          ok: false,
          reason: error instanceof Error ? error.message : "fifo_process_failed"
        });
      }
    }

    return jsonResponse(
      {
        ok: true,
        processedCount,
        skippedCount: 0,
        failedCount,
        results
      },
      200
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
