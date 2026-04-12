import {
  ACCIDENT_DB_PROPERTY_NAMES,
  ASIA_SEOUL_TIMEZONE,
  ATTACHMENT_UPLOAD_STATUS,
  DEFAULT_BUSINESS_OR_SCHOOL_NAME,
  INITIAL_ACCIDENT_STATUS,
  UNKNOWN_OCCURRENCE_TIME
} from "./constants";
import type {
  BuildAccidentDbPropertiesInput,
  NormalizedSubmitInput,
  NotionAccidentDbPropertiesPayload
} from "./types";

function hasText(value?: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toTitle(content: string) {
  return {
    title: [{ text: { content } }]
  };
}

function toRichText(content: string) {
  return {
    rich_text: [{ text: { content } }]
  };
}

function toSelect(name: string) {
  return {
    select: { name }
  };
}

function toMultiSelect(names: string[]) {
  return {
    multi_select: names.map((name) => ({ name }))
  };
}

function toDate(start: string) {
  return {
    date: {
      start,
      time_zone: ASIA_SEOUL_TIMEZONE
    }
  };
}

function buildOccurrenceStart(normalized: NormalizedSubmitInput) {
  const timePart =
    normalized.timeUnknown || !hasText(normalized.occurredTime)
      ? UNKNOWN_OCCURRENCE_TIME
      : `${normalized.occurredTime}:00`;

  return `${normalized.occurredDate}T${timePart}`;
}

function buildInitialAttachmentUploadStatus(attachmentCount?: number) {
  return attachmentCount && attachmentCount > 0
    ? ATTACHMENT_UPLOAD_STATUS.processing
    : ATTACHMENT_UPLOAD_STATUS.complete;
}

export function buildAccidentDbProperties({
  receiptNumber,
  normalized
}: BuildAccidentDbPropertiesInput): NotionAccidentDbPropertiesPayload {
  const properties: NotionAccidentDbPropertiesPayload = {
    [ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]: toTitle(receiptNumber),
    [ACCIDENT_DB_PROPERTY_NAMES.status]: {
      status: { name: INITIAL_ACCIDENT_STATUS }
    },
    [ACCIDENT_DB_PROPERTY_NAMES.occurredAt]: toDate(
      buildOccurrenceStart(normalized)
    ),
    [ACCIDENT_DB_PROPERTY_NAMES.businessOrSchoolName]: toRichText(
      hasText(normalized.businessOrSchoolName)
        ? normalized.businessOrSchoolName
        : DEFAULT_BUSINESS_OR_SCHOOL_NAME
    ),
    [ACCIDENT_DB_PROPERTY_NAMES.phone]: {
      phone_number: normalized.phone
    },
    [ACCIDENT_DB_PROPERTY_NAMES.email]: {
      email: normalized.email
    },
    [ACCIDENT_DB_PROPERTY_NAMES.bodyPartContacted]: toRichText(
      normalized.bodyPartContacted
    ),
    [ACCIDENT_DB_PROPERTY_NAMES.visibleInjuryMark]: toSelect(
      normalized.visibleInjuryMark
    ),
    [ACCIDENT_DB_PROPERTY_NAMES.sawSerialNumber]: toRichText(
      normalized.sawSerialNumber
    ),
    [ACCIDENT_DB_PROPERTY_NAMES.materialType]: toRichText(
      normalized.materialType
    ),
    [ACCIDENT_DB_PROPERTY_NAMES.incidentDescription]: toRichText(
      normalized.incidentDescription
    ),
    [ACCIDENT_DB_PROPERTY_NAMES.promotionalConsent]: toSelect(
      normalized.promotionalConsent
    ),
    [ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus]: toSelect(
      buildInitialAttachmentUploadStatus(normalized.attachmentCount)
    )
  };

  if (hasText(normalized.operatorName)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.operatorName] = toRichText(
      normalized.operatorName
    );
  }

  if (hasText(normalized.touchedPersonName)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.touchedPersonName] = toRichText(
      normalized.touchedPersonName
    );
  }

  if (hasText(normalized.woundTreatmentMethods)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.woundTreatmentMethods] = toRichText(
      normalized.woundTreatmentMethods
    );
  }

  if (hasText(normalized.estimatedInjuryWithoutSawStop)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.estimatedInjuryWithoutSawStop] =
      toRichText(normalized.estimatedInjuryWithoutSawStop);
  }

  if (hasText(normalized.incidentCause)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.incidentCause] = toRichText(
      normalized.incidentCause
    );
  }

  if (hasText(normalized.brakeCartridgeSerialNumber)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.brakeCartridgeSerialNumber] =
      toRichText(normalized.brakeCartridgeSerialNumber);
  }

  if (hasText(normalized.bladeType)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.bladeType] = toSelect(
      normalized.bladeType
    );
  }

  if (hasText(normalized.bladeDetails)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.bladeDetails] = toRichText(
      normalized.bladeDetails
    );
  }

  if (hasText(normalized.workpieceSizeAndCutType)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.workpieceSizeAndCutType] =
      toRichText(normalized.workpieceSizeAndCutType);
  }

  if (hasText(normalized.safetyDeviceStatus)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.safetyDeviceStatus] = toRichText(
      normalized.safetyDeviceStatus
    );
  }

  if (
    Array.isArray(normalized.otherDevicesUsed) &&
    normalized.otherDevicesUsed.length > 0
  ) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.otherDevicesUsed] = toMultiSelect(
      normalized.otherDevicesUsed
    );
  }

  if (hasText(normalized.wearingGloves)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.wearingGloves] = toSelect(
      normalized.wearingGloves
    );
  }

  if (hasText(normalized.approximateFeedRate)) {
    properties[ACCIDENT_DB_PROPERTY_NAMES.approximateFeedRate] = toSelect(
      normalized.approximateFeedRate
    );
  }

  return properties;
}
