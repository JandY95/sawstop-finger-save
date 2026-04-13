import { CUSTOMER_FAILURE_MESSAGE } from "../constants.ts";
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
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.trunc(requestedLimit), 20)
        : 20;

    const candidates = await listFifoTrashCandidates(env, limit);
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
