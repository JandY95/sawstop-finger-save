import {
  ASIA_SEOUL_TIMEZONE,
  ATTACHMENT_TRASH_RETENTION_DAYS
} from "./constants.ts";

type Clock = () => Date;

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?$/;
const CLEANUP_HOUR = 8;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseLocalDateTime(dateTime: string) {
  const match = LOCAL_DATE_TIME_PATTERN.exec(dateTime);
  if (!match) {
    throw new Error(`Invalid local ISO datetime: ${dateTime}`);
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    millisecondText
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText ?? "0");

  const calendarDate = new Date(0);
  calendarDate.setUTCHours(0, 0, 0, 0);
  calendarDate.setUTCFullYear(year, month - 1, day);

  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error(`Invalid local ISO datetime: ${dateTime}`);
  }

  return { calendarDate, hour, minute, second, millisecond };
}

export function formatSeoulLocalIsoDateTime(instant: Date) {
  if (!Number.isFinite(instant.getTime())) {
    throw new Error("Invalid clock date");
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ASIA_SEOUL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23"
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}.${values.fractionalSecond}`;
}

export function calculatePermanentDeleteAt(
  trashMovedAt: string,
  retentionDays = ATTACHMENT_TRASH_RETENTION_DAYS
) {
  if (!Number.isInteger(retentionDays) || retentionDays < 0) {
    throw new Error(`Invalid retention days: ${retentionDays}`);
  }

  const { calendarDate, hour, minute, second, millisecond } =
    parseLocalDateTime(trashMovedAt);
  calendarDate.setUTCDate(calendarDate.getUTCDate() + retentionDays);

  const isAfterCleanupBoundary =
    hour > CLEANUP_HOUR ||
    (hour === CLEANUP_HOUR &&
      (minute > 0 || second > 0 || millisecond > 0));
  if (isAfterCleanupBoundary) {
    calendarDate.setUTCDate(calendarDate.getUTCDate() + 1);
  }

  return `${calendarDate.getUTCFullYear()}-${pad2(
    calendarDate.getUTCMonth() + 1
  )}-${pad2(calendarDate.getUTCDate())}T${pad2(CLEANUP_HOUR)}:00:00`;
}

export function buildAttachmentTrashDates(
  clock: Clock = () => new Date()
) {
  const trashMovedAt = formatSeoulLocalIsoDateTime(clock());

  return {
    trashMovedAt,
    permanentDeleteAt: calculatePermanentDeleteAt(trashMovedAt)
  };
}
