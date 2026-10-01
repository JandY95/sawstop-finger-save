import {
  ATTACHMENT_DB_STATUS,
  ATTACHMENT_DELETE_REASON_OPTIONS
} from "../constants.ts";
import type { WorkerEnv } from "../types.ts";

export type FifoTrashDeleteNotionSnapshot = {
  attachmentPageId: string;
  accidentPageId: string;
  r2Key: string;
  permanentDeleteAt: string | null;
  attachmentType: string | null;
  deletionReason: string | null;
  status: string;
};

export type FifoTrashDeleteR2Snapshot = {
  key: string;
  sizeBytes: number;
  contentSha256: string;
};

export type ApprovedFifoTrashDeleteTarget = FifoTrashDeleteNotionSnapshot &
  FifoTrashDeleteR2Snapshot;

export type ApprovedFifoTrashDeleteRequest = {
  fixtureOnlyConfirmed: boolean;
  exactTargetsConfirmed: boolean;
  irreversibleDeleteConfirmed: boolean;
  approvedTargets: ApprovedFifoTrashDeleteTarget[];
  confirmationToken: string;
};

export type FifoTrashDeleteDependencies = {
  now(): string;
  readNotionTarget(
    attachmentPageId: string
  ): Promise<FifoTrashDeleteNotionSnapshot | null>;
  refreshAccidentDerivedState(accidentPageId: string): Promise<void>;
  markNotionPermanentlyDeleted(attachmentPageId: string): Promise<void>;
  readR2Target(key: string): Promise<FifoTrashDeleteR2Snapshot | null>;
  deleteExactR2Target(target: FifoTrashDeleteR2Snapshot): Promise<void>;
};

export type FifoTrashDeleteStage =
  | "preflight"
  | "notion-refresh"
  | "notion-mark"
  | "notion-readback"
  | "r2-pre-delete-readback"
  | "r2-delete"
  | "r2-readback"
  | "complete"
  | "already-complete";

export type FifoTrashDeleteResultItem = {
  attachmentPageId: string;
  ok: boolean;
  stage: FifoTrashDeleteStage;
  reason?: string;
};

export type FifoTrashDeleteExecutionResult = {
  outcome: "complete" | "partial" | "hold";
  reasonCode:
    | "DELETE_COMPLETE"
    | "PARTIAL_FAILURE"
    | "FORCE_NOT_ALLOWED"
    | "APPROVAL_INCOMPLETE"
    | "UNSAFE_EXACT_TARGET"
    | "DUPLICATE_APPROVAL_TARGET"
    | "CONFIRMATION_TOKEN_MISMATCH"
    | "TARGET_NOT_EXPIRED"
    | "TARGET_READBACK_MISMATCH";
  approvedTargetCount: number;
  deletedCount: number;
  preReadbackMatched: boolean;
  postReadbackMatched: boolean;
  results: FifoTrashDeleteResultItem[];
};

type PreflightTarget = {
  approved: ApprovedFifoTrashDeleteTarget;
  notion: FifoTrashDeleteNotionSnapshot;
  r2: FifoTrashDeleteR2Snapshot | null;
  resumeAfterNotionMark: boolean;
  alreadyComplete: boolean;
};

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const UNSAFE_EXACT_MARKERS = ["*", "?", "[", "]", "{", "}"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasUnsafeMarker(value: string) {
  return UNSAFE_EXACT_MARKERS.some((marker) => value.includes(marker));
}

function isSafeOpaqueId(value: string) {
  return (
    value.length > 0 &&
    value === value.trim() &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !hasUnsafeMarker(value)
  );
}

function isSafeExactFinalKey(value: string) {
  const parts = value.split("/");
  return (
    value === value.trim() &&
    parts.length >= 3 &&
    parts[0] === "attachments" &&
    parts.every((part) => part.length > 0 && part !== "." && part !== "..") &&
    !value.endsWith("/") &&
    !value.includes("\\") &&
    !hasUnsafeMarker(value)
  );
}

function isValidDateTime(value: string) {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}

function isValidDeleteReason(value: string | null) {
  return (
    value === null ||
    (ATTACHMENT_DELETE_REASON_OPTIONS as readonly string[]).includes(value)
  );
}

function targetHasCompleteShape(
  value: unknown
): value is ApprovedFifoTrashDeleteTarget {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.attachmentPageId === "string" &&
    typeof value.accidentPageId === "string" &&
    typeof value.r2Key === "string" &&
    typeof value.permanentDeleteAt === "string" &&
    (typeof value.attachmentType === "string" || value.attachmentType === null) &&
    (typeof value.deletionReason === "string" || value.deletionReason === null) &&
    typeof value.status === "string" &&
    typeof value.key === "string" &&
    Number.isSafeInteger(value.sizeBytes) &&
    (value.sizeBytes as number) >= 0 &&
    typeof value.contentSha256 === "string" &&
    SHA256_HEX.test(value.contentSha256)
  );
}

function targetIsExactAndSafe(target: ApprovedFifoTrashDeleteTarget) {
  return (
    isSafeOpaqueId(target.attachmentPageId) &&
    isSafeOpaqueId(target.accidentPageId) &&
    isSafeExactFinalKey(target.r2Key) &&
    target.key === target.r2Key &&
    isValidDateTime(target.permanentDeleteAt as string) &&
    target.status === ATTACHMENT_DB_STATUS.trash &&
    isValidDeleteReason(target.deletionReason)
  );
}

function canonicalApproval(targets: ApprovedFifoTrashDeleteTarget[]) {
  return JSON.stringify(
    targets.map((target) => ({
      attachmentPageId: target.attachmentPageId,
      accidentPageId: target.accidentPageId,
      r2Key: target.r2Key,
      permanentDeleteAt: target.permanentDeleteAt,
      attachmentType: target.attachmentType,
      deletionReason: target.deletionReason,
      status: target.status,
      key: target.key,
      sizeBytes: target.sizeBytes,
      contentSha256: target.contentSha256.toLowerCase()
    }))
  );
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function createFifoTrashConfirmationToken(
  targets: ApprovedFifoTrashDeleteTarget[]
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`T32-fixture-exact-delete\n${canonicalApproval(targets)}`)
  );
  return `T32-${bytesToHex(new Uint8Array(digest))}`;
}

function sameR2Snapshot(
  current: FifoTrashDeleteR2Snapshot | null,
  approved: ApprovedFifoTrashDeleteTarget
) {
  return (
    current !== null &&
    current.key === approved.key &&
    current.sizeBytes === approved.sizeBytes &&
    current.contentSha256.toLowerCase() === approved.contentSha256.toLowerCase()
  );
}

function sameStableNotionSnapshot(
  current: FifoTrashDeleteNotionSnapshot,
  approved: ApprovedFifoTrashDeleteTarget
) {
  return (
    current.attachmentPageId === approved.attachmentPageId &&
    current.accidentPageId === approved.accidentPageId &&
    current.r2Key === approved.r2Key &&
    current.permanentDeleteAt === approved.permanentDeleteAt &&
    current.attachmentType === approved.attachmentType &&
    current.deletionReason === approved.deletionReason
  );
}

function holdResult(
  reasonCode: FifoTrashDeleteExecutionResult["reasonCode"],
  approvedTargetCount: number,
  preReadbackMatched = false
): FifoTrashDeleteExecutionResult {
  return {
    outcome: "hold",
    reasonCode,
    approvedTargetCount,
    deletedCount: 0,
    preReadbackMatched,
    postReadbackMatched: false,
    results: []
  };
}

function safeFailureReason(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }
  return /^[a-z0-9_:-]+$/i.test(error.message) ? error.message : fallback;
}

async function preflightApprovedTargets(
  targets: ApprovedFifoTrashDeleteTarget[],
  dependencies: FifoTrashDeleteDependencies
): Promise<PreflightTarget[] | null> {
  const preflight: PreflightTarget[] = [];

  for (const approved of targets) {
    const notion = await dependencies.readNotionTarget(approved.attachmentPageId);
    const r2 = await dependencies.readR2Target(approved.r2Key);
    if (!notion || !sameStableNotionSnapshot(notion, approved)) {
      return null;
    }

    if (notion.status === ATTACHMENT_DB_STATUS.trash) {
      if (!sameR2Snapshot(r2, approved)) {
        return null;
      }
      preflight.push({
        approved,
        notion,
        r2,
        resumeAfterNotionMark: false,
        alreadyComplete: false
      });
      continue;
    }

    if (notion.status !== ATTACHMENT_DB_STATUS.permanentlyDeleted) {
      return null;
    }
    if (r2 && !sameR2Snapshot(r2, approved)) {
      return null;
    }

    preflight.push({
      approved,
      notion,
      r2,
      resumeAfterNotionMark: r2 !== null,
      alreadyComplete: r2 === null
    });
  }

  return preflight;
}

export async function executeApprovedFifoTrashDeletion(
  request: ApprovedFifoTrashDeleteRequest,
  dependencies: FifoTrashDeleteDependencies
): Promise<FifoTrashDeleteExecutionResult> {
  const rawRequest = request as unknown as Record<string, unknown>;
  if (isRecord(rawRequest) && Object.hasOwn(rawRequest, "force")) {
    return holdResult("FORCE_NOT_ALLOWED", 0);
  }
  if (
    !isRecord(rawRequest) ||
    rawRequest.fixtureOnlyConfirmed !== true ||
    rawRequest.exactTargetsConfirmed !== true ||
    rawRequest.irreversibleDeleteConfirmed !== true ||
    !Array.isArray(rawRequest.approvedTargets) ||
    rawRequest.approvedTargets.length === 0 ||
    typeof rawRequest.confirmationToken !== "string" ||
    rawRequest.approvedTargets.some((target) => !targetHasCompleteShape(target))
  ) {
    return holdResult(
      "APPROVAL_INCOMPLETE",
      Array.isArray(rawRequest.approvedTargets)
        ? rawRequest.approvedTargets.length
        : 0
    );
  }

  const targets = rawRequest.approvedTargets as ApprovedFifoTrashDeleteTarget[];
  if (targets.some((target) => !targetIsExactAndSafe(target))) {
    return holdResult("UNSAFE_EXACT_TARGET", targets.length);
  }
  if (
    new Set(targets.map((target) => target.attachmentPageId)).size !==
      targets.length ||
    new Set(targets.map((target) => target.r2Key)).size !== targets.length
  ) {
    return holdResult("DUPLICATE_APPROVAL_TARGET", targets.length);
  }

  const expectedToken = await createFifoTrashConfirmationToken(targets);
  if (request.confirmationToken !== expectedToken) {
    return holdResult("CONFIRMATION_TOKEN_MISMATCH", targets.length);
  }

  const now = Date.parse(dependencies.now());
  if (
    !Number.isFinite(now) ||
    targets.some((target) => Date.parse(target.permanentDeleteAt as string) > now)
  ) {
    return holdResult("TARGET_NOT_EXPIRED", targets.length);
  }

  let preflight: PreflightTarget[] | null;
  try {
    preflight = await preflightApprovedTargets(targets, dependencies);
  } catch {
    preflight = null;
  }
  if (!preflight) {
    return holdResult("TARGET_READBACK_MISMATCH", targets.length);
  }

  const results: FifoTrashDeleteResultItem[] = [];
  let deletedCount = 0;

  for (const target of preflight) {
    if (target.alreadyComplete) {
      results.push({
        attachmentPageId: target.approved.attachmentPageId,
        ok: true,
        stage: "already-complete"
      });
      continue;
    }

    try {
      await dependencies.refreshAccidentDerivedState(target.approved.accidentPageId);
    } catch (error) {
      results.push({
        attachmentPageId: target.approved.attachmentPageId,
        ok: false,
        stage: "notion-refresh",
        reason: safeFailureReason(error, "notion_refresh_failed")
      });
      continue;
    }

    if (!target.resumeAfterNotionMark) {
      try {
        await dependencies.markNotionPermanentlyDeleted(
          target.approved.attachmentPageId
        );
      } catch (error) {
        results.push({
          attachmentPageId: target.approved.attachmentPageId,
          ok: false,
          stage: "notion-mark",
          reason: safeFailureReason(error, "notion_mark_failed")
        });
        continue;
      }
    }

    let notionReadback: FifoTrashDeleteNotionSnapshot | null;
    try {
      notionReadback = await dependencies.readNotionTarget(
        target.approved.attachmentPageId
      );
    } catch {
      notionReadback = null;
    }
    if (
      !notionReadback ||
      !sameStableNotionSnapshot(notionReadback, target.approved) ||
      notionReadback.status !== ATTACHMENT_DB_STATUS.permanentlyDeleted
    ) {
      results.push({
        attachmentPageId: target.approved.attachmentPageId,
        ok: false,
        stage: "notion-readback",
        reason: "notion_post_readback_mismatch"
      });
      continue;
    }

    let r2PreDelete: FifoTrashDeleteR2Snapshot | null;
    try {
      r2PreDelete = await dependencies.readR2Target(target.approved.r2Key);
    } catch {
      r2PreDelete = null;
    }
    if (!sameR2Snapshot(r2PreDelete, target.approved)) {
      results.push({
        attachmentPageId: target.approved.attachmentPageId,
        ok: false,
        stage: "r2-pre-delete-readback",
        reason: "r2_pre_delete_readback_mismatch"
      });
      continue;
    }

    let deleteError: unknown = null;
    try {
      await dependencies.deleteExactR2Target({
        key: target.approved.key,
        sizeBytes: target.approved.sizeBytes,
        contentSha256: target.approved.contentSha256
      });
    } catch (error) {
      deleteError = error;
    }

    let r2Readback: FifoTrashDeleteR2Snapshot | null;
    try {
      r2Readback = await dependencies.readR2Target(target.approved.r2Key);
    } catch {
      r2Readback = target.approved;
    }
    if (r2Readback !== null) {
      results.push({
        attachmentPageId: target.approved.attachmentPageId,
        ok: false,
        stage: deleteError ? "r2-delete" : "r2-readback",
        reason: deleteError
          ? safeFailureReason(deleteError, "r2_delete_failed")
          : "r2_post_readback_mismatch"
      });
      continue;
    }

    deletedCount += 1;
    results.push({
      attachmentPageId: target.approved.attachmentPageId,
      ok: true,
      stage: "complete",
      ...(deleteError ? { reason: "delete_result_ambiguous_but_absent" } : {})
    });
  }

  const complete = results.every((result) => result.ok);
  return {
    outcome: complete ? "complete" : "partial",
    reasonCode: complete ? "DELETE_COMPLETE" : "PARTIAL_FAILURE",
    approvedTargetCount: targets.length,
    deletedCount,
    preReadbackMatched: true,
    postReadbackMatched: complete,
    results
  };
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function requestContainsForce(request: Request) {
  try {
    const rawBody = await request.text();
    if (rawBody.trim().length === 0) {
      return false;
    }
    const body = JSON.parse(rawBody) as unknown;
    return isRecord(body) && Object.hasOwn(body, "force");
  } catch {
    return false;
  }
}

export async function handleAdminProcessFifoTrash(
  request: Request,
  _env: WorkerEnv
) {
  const forceRequested = await requestContainsForce(request);
  return jsonResponse(
    {
      ok: false,
      message: forceRequested
        ? "force execution is not allowed"
        : "T32 is fixture-only; live deletion is disabled"
    },
    forceRequested ? 400 : 403
  );
}
