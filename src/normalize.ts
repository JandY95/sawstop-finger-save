import type { NormalizedSubmitInput } from "./types";

function toTrimmedString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalString(value: FormDataEntryValue | null) {
  const trimmed = toTrimmedString(value);
  return trimmed.length > 0 ? trimmed : null;
}

function toLowercaseEmail(value: FormDataEntryValue | null) {
  return toTrimmedString(value).toLowerCase();
}

function toFormattedPhone(value: FormDataEntryValue | null) {
  const digits = toTrimmedString(value).replace(/\D/g, "");

  if (digits.startsWith("02")) {
    if (digits.length === 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    }

    if (digits.length === 10) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return digits;
}

function toBoolean(value: FormDataEntryValue | null) {
  const normalized = toTrimmedString(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
}

function toMultiValueStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function countImageAttachments(formData: FormData) {
  return formData
    .getAll("attachments")
    .filter((value): value is File => typeof File !== "undefined" && value instanceof File)
    .filter((file) => file.size > 0).length;
}

export function normalizeSubmitFormData(formData: FormData): NormalizedSubmitInput {
  return {
    businessOrSchoolName: toOptionalString(formData.get("businessOrSchoolName")),
    phone: toFormattedPhone(formData.get("phone")),
    email: toLowercaseEmail(formData.get("email")),
    occurredDate: toTrimmedString(formData.get("occurredDate")),
    occurredTime: toOptionalString(formData.get("occurredTime")),
    timeUnknown: toBoolean(formData.get("timeUnknown")),
    operatorName: toOptionalString(formData.get("operatorName")),
    touchedPersonName: toOptionalString(formData.get("touchedPersonName")),
    bodyPartContacted: toTrimmedString(formData.get("bodyPartContacted")),
    visibleInjuryMark: toTrimmedString(formData.get("visibleInjuryMark")) as NormalizedSubmitInput["visibleInjuryMark"],
    woundTreatmentMethods: toOptionalString(formData.get("woundTreatmentMethods")),
    estimatedInjuryWithoutSawStop: toOptionalString(
      formData.get("estimatedInjuryWithoutSawStop")
    ),
    incidentCause: toOptionalString(formData.get("incidentCause")),
    incidentDescription: toTrimmedString(formData.get("incidentDescription")),
    sawSerialNumber: toTrimmedString(formData.get("sawSerialNumber")).toUpperCase(),
    brakeCartridgeSerialNumber: toOptionalString(
      formData.get("brakeCartridgeSerialNumber")
    ),
    bladeType: toOptionalString(formData.get("bladeType")) as NormalizedSubmitInput["bladeType"],
    bladeDetails: toOptionalString(formData.get("bladeDetails")),
    materialType: toTrimmedString(formData.get("materialType")),
    workpieceSizeAndCutType: toOptionalString(formData.get("workpieceSizeAndCutType")),
    safetyDeviceStatus: toOptionalString(formData.get("safetyDeviceStatus")),
    otherDevicesUsed: toMultiValueStrings(formData, "otherDevicesUsed") as NormalizedSubmitInput["otherDevicesUsed"],
    wearingGloves: toOptionalString(formData.get("wearingGloves")) as NormalizedSubmitInput["wearingGloves"],
    approximateFeedRate: toOptionalString(
      formData.get("approximateFeedRate")
    ) as NormalizedSubmitInput["approximateFeedRate"],
    promotionalConsent: toTrimmedString(
      formData.get("promotionalConsent")
    ) as NormalizedSubmitInput["promotionalConsent"],
    attachmentCount: countImageAttachments(formData)
  };
}
