import {
  BLADE_TYPE_OPTIONS,
  FEED_RATE_OPTIONS,
  GLOVES_OPTIONS,
  OTHER_DEVICE_OPTIONS,
  PROMOTIONAL_CONSENT_OPTIONS,
  VISIBLE_INJURY_MARK_OPTIONS
} from "./constants";
import type { NormalizedSubmitInput, SubmitValidationResult } from "./types";

const SAW_SERIAL_NUMBER_PATTERN = /^[IPC]\d{9}$/;
const PHONE_PATTERN = /^0\d{1,2}-\d{3,4}-\d{4}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OCCURRENCE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function hasAllowedSingleValue<T extends readonly string[]>(
  value: string | null | undefined,
  allowedValues: T
) {
  return typeof value === "string" && allowedValues.includes(value);
}

function hasAllowedMultiValues<T extends readonly string[]>(
  values: string[] | null | undefined,
  allowedValues: T
) {
  return (
    values == null ||
    (Array.isArray(values) &&
      values.every((value) => typeof value === "string" && allowedValues.includes(value)))
  );
}

function hasOccurrenceTimeOrUnknown(normalized: NormalizedSubmitInput) {
  return (
    normalized.timeUnknown === true ||
    (typeof normalized.occurredTime === "string" &&
      OCCURRENCE_TIME_PATTERN.test(normalized.occurredTime))
  );
}

export function validateSubmitInput(
  normalized: NormalizedSubmitInput
): SubmitValidationResult {
  const isValid = Boolean(
    normalized.phone &&
      PHONE_PATTERN.test(normalized.phone) &&
      normalized.email &&
      EMAIL_PATTERN.test(normalized.email) &&
      normalized.occurredDate &&
      hasOccurrenceTimeOrUnknown(normalized) &&
      normalized.bodyPartContacted &&
      normalized.sawSerialNumber &&
      SAW_SERIAL_NUMBER_PATTERN.test(normalized.sawSerialNumber) &&
      normalized.materialType &&
      normalized.incidentDescription &&
      hasAllowedSingleValue(
        normalized.promotionalConsent,
        PROMOTIONAL_CONSENT_OPTIONS
      ) &&
      hasAllowedSingleValue(
        normalized.visibleInjuryMark,
        VISIBLE_INJURY_MARK_OPTIONS
      ) &&
      (normalized.bladeType == null ||
        hasAllowedSingleValue(normalized.bladeType, BLADE_TYPE_OPTIONS)) &&
      (normalized.wearingGloves == null ||
        hasAllowedSingleValue(normalized.wearingGloves, GLOVES_OPTIONS)) &&
      (normalized.approximateFeedRate == null ||
        hasAllowedSingleValue(
          normalized.approximateFeedRate,
          FEED_RATE_OPTIONS
        )) &&
      hasAllowedMultiValues(normalized.otherDevicesUsed, OTHER_DEVICE_OPTIONS)
  );

  return { isValid };
}
