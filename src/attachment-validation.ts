import {
  CUSTOMER_ATTACHMENT_MAX_FILE_SIZE_BYTES
} from "./constants.ts";

export type AttachmentFormat = "jpeg" | "png" | "webp" | "heif";

export type AttachmentValidationFailureReason =
  | "unsupported_extension"
  | "mime_mismatch"
  | "empty_file"
  | "file_too_large"
  | "signature_mismatch";

export type AttachmentValidationResult =
  | { ok: true; format: AttachmentFormat }
  | { ok: false; reason: AttachmentValidationFailureReason };

export interface AttachmentMetadataInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface AttachmentFileInput extends AttachmentMetadataInput {
  bytes: ArrayBuffer;
}

const FORMAT_BY_EXTENSION: Readonly<Record<string, AttachmentFormat>> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".webp": "webp",
  ".heic": "heif",
  ".heif": "heif"
};

const MIME_TYPES_BY_FORMAT: Readonly<Record<AttachmentFormat, readonly string[]>> = {
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  heif: ["image/heic", "image/heif"]
};

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1"
]);

function getExpectedAttachmentFormat(fileName: string): AttachmentFormat | null {
  const normalizedName = fileName.trim().toLowerCase();
  for (const [extension, format] of Object.entries(FORMAT_BY_EXTENSION)) {
    if (normalizedName.endsWith(extension)) {
      return format;
    }
  }

  return null;
}

function startsWithBytes(bytes: Uint8Array, expected: readonly number[]) {
  return (
    bytes.byteLength >= expected.length &&
    expected.every((value, index) => bytes[index] === value)
  );
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    return "";
  }

  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    return null;
  }

  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function hasHeifSignature(bytes: Uint8Array) {
  if (bytes.byteLength < 16 || readAscii(bytes, 4, 4) !== "ftyp") {
    return false;
  }

  const declaredBoxSize = readUint32BigEndian(bytes, 0);
  if (declaredBoxSize == null || declaredBoxSize === 1) {
    return false;
  }

  const boxEnd = declaredBoxSize === 0 ? bytes.byteLength : declaredBoxSize;
  if (boxEnd < 16 || boxEnd > bytes.byteLength) {
    return false;
  }

  if (HEIF_BRANDS.has(readAscii(bytes, 8, 4))) {
    return true;
  }

  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    if (HEIF_BRANDS.has(readAscii(bytes, offset, 4))) {
      return true;
    }
  }

  return false;
}

export function detectAttachmentFormat(bytesBuffer: ArrayBuffer): AttachmentFormat | null {
  const bytes = new Uint8Array(bytesBuffer);

  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (
    readAscii(bytes, 0, 4) === "RIFF" &&
    readAscii(bytes, 8, 4) === "WEBP"
  ) {
    return "webp";
  }
  if (hasHeifSignature(bytes)) {
    return "heif";
  }

  return null;
}

export function validateAttachmentMetadata(
  input: AttachmentMetadataInput
): AttachmentValidationResult {
  const expectedFormat = getExpectedAttachmentFormat(input.fileName);
  if (!expectedFormat) {
    return { ok: false, reason: "unsupported_extension" };
  }

  if (input.sizeBytes <= 0) {
    return { ok: false, reason: "empty_file" };
  }
  if (input.sizeBytes > CUSTOMER_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
    return { ok: false, reason: "file_too_large" };
  }

  const normalizedContentType = input.contentType.trim().toLowerCase();
  if (
    normalizedContentType &&
    normalizedContentType !== "application/octet-stream" &&
    !MIME_TYPES_BY_FORMAT[expectedFormat].includes(normalizedContentType)
  ) {
    return { ok: false, reason: "mime_mismatch" };
  }

  return { ok: true, format: expectedFormat };
}

export function validateAttachmentContent(
  fileName: string,
  bytes: ArrayBuffer
): AttachmentValidationResult {
  const expectedFormat = getExpectedAttachmentFormat(fileName);
  if (!expectedFormat) {
    return { ok: false, reason: "unsupported_extension" };
  }

  const detectedFormat = detectAttachmentFormat(bytes);
  if (detectedFormat !== expectedFormat) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true, format: expectedFormat };
}

export function validateAttachmentFile(
  input: AttachmentFileInput
): AttachmentValidationResult {
  const metadataResult = validateAttachmentMetadata(input);
  if (!metadataResult.ok) {
    return metadataResult;
  }

  return validateAttachmentContent(input.fileName, input.bytes);
}
