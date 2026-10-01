// The ledger's first level-2 section is the only authorization source.
// Historical assignments are evidence, never an authorization fallback.
export const APPROVED_DEPLOY_CHECKPOINT_MARKER =
  "T55_DEPLOY_AUTHORIZED_CHECKPOINT_SHA";
export const CURRENT_AUTHORIZATION_HEADING = "## Current Machine State";
export const CURRENT_AUTHORIZATION_BEGIN =
  "<!-- T55_DEPLOY_AUTHORIZED_CHECKPOINT_CURRENT_BEGIN -->";
export const CURRENT_AUTHORIZATION_END =
  "<!-- T55_DEPLOY_AUTHORIZED_CHECKPOINT_CURRENT_END -->";

export class CurrentAuthorizationError extends Error {
  constructor(code) {
    super(code);
    this.name = "CurrentAuthorizationError";
    this.code = code;
  }
}

function deny(code) {
  throw new CurrentAuthorizationError(`${code}_CURRENT_AUTHORIZATION`);
}

export function parseCurrentApprovedDeployCheckpoint(ledgerText) {
  if (typeof ledgerText !== "string") deny("MALFORMED");
  // LF is the canonical serialization. Do not trim/normalize any state bytes.
  const lines = ledgerText.split("\n");
  const headings = [];
  const begins = [];
  const ends = [];
  for (const [index, line] of lines.entries()) {
    if (line === CURRENT_AUTHORIZATION_HEADING) headings.push(index);
    if (line === CURRENT_AUTHORIZATION_BEGIN) begins.push(index);
    if (line === CURRENT_AUTHORIZATION_END) ends.push(index);
    // Broad detection is rejection-only. A malformed reserved delimiter cannot
    // disappear while a different valid-looking block grants authorization.
    if (
      /^[^\n]*T55_DEPLOY_AUTHORIZED_CHECKPOINT_CURRENT_(?:BEGIN|END)[^\n]*$/u.test(line) &&
      line !== CURRENT_AUTHORIZATION_BEGIN &&
      line !== CURRENT_AUTHORIZATION_END
    ) deny("MALFORMED");
  }
  // Count exact delimiters everywhere, including fenced historical examples:
  // a second current block is ambiguous even if only one is in the right place.
  if (headings.length > 1 || begins.length > 1 || ends.length > 1) deny("AMBIGUOUS");
  if (begins.length === 0 && ends.length === 0) deny("MISSING");
  if (headings.length !== 1 || begins.length !== 1 || ends.length !== 1) deny("MALFORMED");
  const [heading] = headings;
  const [begin] = begins;
  const [end] = ends;

  // Enforce structural location instead of a partial Markdown/fence parser.
  // Before this first section only a title, quoted metadata, and blank lines
  // are permitted. No code fence, HTML wrapper, earlier section or prose can
  // contain it. Nothing arbitrary is allowed inside the machine section.
  const preamble = lines.slice(0, heading);
  if (!preamble.every((line) => line === "" || line === ">" || /^# [^\r\n]+$/u.test(line) || /^> [^\r\n]*$/u.test(line))) {
    deny("MALFORMED");
  }
  if (begin !== heading + 2 || lines[heading + 1] !== "" || end !== begin + 2) {
    deny("MALFORMED");
  }
  for (let index = end + 1; index < lines.length; index += 1) {
    if (/^## [^\r\n]+$/u.test(lines[index])) break;
    if (lines[index] !== "") deny("MALFORMED");
  }

  const state = lines[begin + 1];
  if (state === `${APPROVED_DEPLOY_CHECKPOINT_MARKER}=NONE`) return { status: "NONE" };
  const prefix = `${APPROVED_DEPLOY_CHECKPOINT_MARKER}=`;
  const sha = state.slice(prefix.length);
  // Reconstruct and compare the entire line; no partial matches or coercion.
  if (state !== `${prefix}${sha}` || sha.length !== 40 || !/^[0-9a-f]{40}$/u.test(sha)) {
    deny("MALFORMED");
  }
  return { status: "APPROVED", sha };
}
