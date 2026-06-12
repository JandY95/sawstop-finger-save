import {
  BLADE_TYPE_OPTIONS,
  FEED_RATE_OPTIONS,
  GLOVES_OPTIONS,
  OTHER_DEVICE_OPTIONS,
  PROMOTIONAL_CONSENT_OPTIONS,
  VISIBLE_INJURY_MARK_OPTIONS
} from "./constants";
import type { NormalizedSubmitInput, SubmitValidationResult } from "./types";

const SAW_SERIAL_NUMBER_PATTERN = /^[CPI]\d{9}$/;
const PHONE_PATTERN = /^(?:010-\d{4}-\d{4}|02-\d{3,4}-\d{4}|(?:03[1-3]|04[1-4]|05[1-5]|06[1-4])-\d{3,4}-\d{4})$/;
const EMAIL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const OCCURRENCE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const OCCURRENCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NO_OTHER_DEVICE_OPTION = "사용하지 않음 (None)";

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

function hasAllowedKoreanPhoneNumber(value: string | null | undefined) {
  return typeof value === "string" && PHONE_PATTERN.test(value);
}

function hasValidEmailAddress(value: string | null | undefined) {
  return (
    typeof value === "string" &&
    !value.includes("..") &&
    EMAIL_PATTERN.test(value)
  );
}

function hasValidOccurrenceDate(value: string | null | undefined) {
  if (typeof value !== "string" || !OCCURRENCE_DATE_PATTERN.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function hasExclusiveOtherDeviceValues(values: string[] | null | undefined) {
  if (!hasAllowedMultiValues(values, OTHER_DEVICE_OPTIONS)) {
    return false;
  }

  if (!Array.isArray(values)) {
    return true;
  }

  return !(
    values.includes(NO_OTHER_DEVICE_OPTION) &&
    values.some((value) => value !== NO_OTHER_DEVICE_OPTION)
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
    hasAllowedKoreanPhoneNumber(normalized.phone) &&
      hasValidEmailAddress(normalized.email) &&
      hasValidOccurrenceDate(normalized.occurredDate) &&
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
      hasExclusiveOtherDeviceValues(normalized.otherDevicesUsed)
  );

  return { isValid };
}
