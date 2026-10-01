import {
  ACCIDENT_REPORT_DRAFT_MARKER,
  ASIA_SEOUL_TIMEZONE,
  BLADE_TYPE_OPTIONS,
  FEED_RATE_OPTIONS,
  GLOVES_OPTIONS,
  OTHER_DEVICE_OPTIONS,
  PROMOTIONAL_CONSENT_OPTIONS,
  VISIBLE_INJURY_MARK_OPTIONS
} from "./constants.ts";

export const LOCAL_CONSERVATIVE_REVIEW_MARKER = "[검수]";
export const LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER = "[Needs follow-up]";

export type LocalConservativeReportFieldKey =
  | "occurredAt"
  | "businessOrSchoolName"
  | "operatorName"
  | "touchedPersonName"
  | "phone"
  | "email"
  | "promotionalConsent"
  | "bodyPartContacted"
  | "visibleInjuryMark"
  | "woundTreatmentMethods"
  | "estimatedInjuryWithoutSawStop"
  | "sawSerialNumber"
  | "brakeCartridgeSerialNumber"
  | "bladeType"
  | "bladeDetails"
  | "materialType"
  | "workpieceSizeAndCutType"
  | "safetyDeviceStatus"
  | "otherDevicesUsed"
  | "wearingGloves"
  | "approximateFeedRate"
  | "incidentCause"
  | "incidentDescription";

export type LocalConservativeReportSource = Partial<
  Record<LocalConservativeReportFieldKey, string>
>;

type ConversionRule = "date" | "selection" | "preserve" | "review_if_korean";

type CanonicalReportFieldDefinition = {
  key: LocalConservativeReportFieldKey | null;
  label: string;
  rule: ConversionRule | "attachment_placeholder";
};

type CanonicalReportSectionDefinition = {
  heading: string;
  fields: readonly CanonicalReportFieldDefinition[];
};

export type CanonicalReportDraft = {
  title: string;
  sections: Array<{
    heading: string;
    fields: Array<{
      label: string;
      value: string;
    }>;
  }>;
};

export type CanonicalReportBlockPlanItem = {
  type: "title" | "section" | "label" | "value" | "empty";
  text: string;
};

export const CANONICAL_REPORT_SECTIONS = [
  {
    heading: "Incident Information",
    fields: [
      { key: "occurredAt", label: "Date of Occurence:", rule: "date" },
      {
        key: "businessOrSchoolName",
        label: "Business or School Name (NA if Not Applicable):",
        rule: "review_if_korean"
      }
    ]
  },
  {
    heading: "People / Contact Information",
    fields: [
      { key: "operatorName", label: "Operator Name:", rule: "review_if_korean" },
      {
        key: "touchedPersonName",
        label: "Name of Person Who Touched the Blade:",
        rule: "review_if_korean"
      },
      { key: "phone", label: "Phone:", rule: "preserve" },
      { key: "email", label: "Email:", rule: "preserve" },
      {
        key: "promotionalConsent",
        label: "Consent for Promotional Use:",
        rule: "selection"
      }
    ]
  },
  {
    heading: "Injury Information",
    fields: [
      {
        key: "bodyPartContacted",
        label: "Body Part Contacted (right or left hand, finger, thumb, etc.):",
        rule: "review_if_korean"
      },
      {
        key: "visibleInjuryMark",
        label: "Was There A Visible Injury Mark?:",
        rule: "selection"
      },
      {
        key: "woundTreatmentMethods",
        label: "Wound treatment methods:",
        rule: "review_if_korean"
      },
      {
        key: "estimatedInjuryWithoutSawStop",
        label: "Estimate of the injury if it were to have occured while using a non-SawStop saw:",
        rule: "review_if_korean"
      }
    ]
  },
  {
    heading: "Saw / Cartridge Information",
    fields: [
      { key: "sawSerialNumber", label: "Saw Serial Number:", rule: "preserve" },
      {
        key: "brakeCartridgeSerialNumber",
        label: "Brake Cartridge Serial Number:",
        rule: "preserve"
      },
      { key: "bladeType", label: "Type of blade being used:", rule: "selection" },
      { key: "bladeDetails", label: "Saw Blade Details:", rule: "review_if_korean" }
    ]
  },
  {
    heading: "Material / Setup / Conditions",
    fields: [
      {
        key: "materialType",
        label: "Type of Material Being Cut?:",
        rule: "review_if_korean"
      },
      {
        key: "workpieceSizeAndCutType",
        label: "Workpiece Size & Cut Type:",
        rule: "review_if_korean"
      },
      {
        key: "safetyDeviceStatus",
        label: "Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any):",
        rule: "review_if_korean"
      },
      {
        key: "otherDevicesUsed",
        label: "Were There Other Devices Being Used When the Cut was Made?:",
        rule: "selection"
      },
      {
        key: "wearingGloves",
        label: "Was the saw operator wearing gloves at the time?:",
        rule: "selection"
      },
      {
        key: "approximateFeedRate",
        label: "What was the approximate feed rate of the material when the accident occured (inches per second)?:",
        rule: "selection"
      }
    ]
  },
  {
    heading: "Incident Description",
    fields: [
      {
        key: "incidentCause",
        label: "Cause of the Incident (Customer Feedback):",
        rule: "review_if_korean"
      },
      {
        key: "incidentDescription",
        label: "To the best of your ability, please describe the circumstances of how the accident happened:",
        rule: "review_if_korean"
      }
    ]
  },
  {
    heading: "Attachments",
    fields: [
      { key: null, label: "첨부(선택):", rule: "attachment_placeholder" }
    ]
  }
] as const satisfies readonly CanonicalReportSectionDefinition[];

function containsKorean(value: string) {
  return /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(value);
}

function markForReview(value: string) {
  return `${value} ${LOCAL_CONSERVATIVE_REVIEW_MARKER}`;
}

function formatOccurrenceDate(rawValue: string) {
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return markForReview(rawValue);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ASIA_SEOUL_TIMEZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(parsed);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("month")} ${getPart("day")}, ${getPart("year")} at ${getPart("hour")}:${getPart("minute")} ${getPart("dayPeriod")} Korea Standard Time (KST, UTC+9)`;
}

const VERIFIED_SELECTION_VALUES: Partial<
  Record<LocalConservativeReportFieldKey, readonly string[]>
> = {
  promotionalConsent: PROMOTIONAL_CONSENT_OPTIONS,
  visibleInjuryMark: VISIBLE_INJURY_MARK_OPTIONS,
  bladeType: BLADE_TYPE_OPTIONS,
  otherDevicesUsed: OTHER_DEVICE_OPTIONS,
  wearingGloves: GLOVES_OPTIONS,
  approximateFeedRate: FEED_RATE_OPTIONS
};

function extractVerifiedSelectionValue(
  fieldKey: LocalConservativeReportFieldKey,
  rawValue: string
) {
  const values = rawValue.split(",").map((value) => value.trim());
  const allowedValues = VERIFIED_SELECTION_VALUES[fieldKey] ?? [];
  if (values.some((value) => !allowedValues.includes(value))) {
    return markForReview(rawValue);
  }

  const converted = values.map((value) => {
    if (!containsKorean(value)) {
      return value;
    }

    const match = value.match(/^.+\(([^()]+)\)$/);
    return match?.[1]?.trim() ?? null;
  });

  return converted.every((value): value is string => value !== null && value.length > 0)
    ? converted.join(", ")
    : markForReview(rawValue);
}

function convertLocalConservativeValue(
  fieldKey: LocalConservativeReportFieldKey,
  rawValue: string | undefined,
  rule: ConversionRule,
  approvedTerms: Readonly<Record<string, string>>
) {
  const value = (rawValue ?? "").trim();
  if (value.length === 0) {
    return LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER;
  }

  if (rule === "date") {
    return formatOccurrenceDate(value);
  }
  if (rule === "selection") {
    return extractVerifiedSelectionValue(fieldKey, value);
  }
  if (rule === "preserve") {
    return value;
  }

  const approvedTerm = approvedTerms[value]?.trim();
  if (approvedTerm) {
    return approvedTerm;
  }

  return containsKorean(value) ? markForReview(value) : value;
}

export function buildLocalConservativeReportDraft(
  source: LocalConservativeReportSource,
  options: {
    approvedTerms?: Readonly<Record<string, string>>;
  } = {}
): CanonicalReportDraft {
  const approvedTerms = options.approvedTerms ?? {};

  return {
    title: ACCIDENT_REPORT_DRAFT_MARKER,
    sections: CANONICAL_REPORT_SECTIONS.map((section) => ({
      heading: section.heading,
      fields: section.fields.map((field) => ({
        label: field.label,
        value:
          field.rule === "attachment_placeholder" || field.key === null
            ? ""
            : convertLocalConservativeValue(field.key, source[field.key], field.rule, approvedTerms)
      }))
    }))
  };
}

export function buildCanonicalReportBlockPlan(
  draft: CanonicalReportDraft
): CanonicalReportBlockPlanItem[] {
  const blocks: CanonicalReportBlockPlanItem[] = [
    { type: "title", text: draft.title }
  ];

  for (const section of draft.sections) {
    blocks.push({ type: "section", text: section.heading });
    for (const field of section.fields) {
      blocks.push({ type: "label", text: field.label });
      blocks.push(
        field.value.length > 0
          ? { type: "value", text: field.value }
          : { type: "empty", text: "" }
      );
    }
  }

  return blocks;
}
